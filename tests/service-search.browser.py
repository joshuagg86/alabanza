"""Optional Chrome smoke test. Uses audio-service/.venv's Playwright and mocked Firebase."""
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CONFIG = """
window.firebase={auth:()=>({onAuthStateChanged(){}}),firestore:{FieldValue:{arrayUnion:id=>({add:id})}}};
window.qaWrites=[];
window.db={collection:name=>({doc:id=>({set:async(data)=>{
    qaWrites.push({id,data});
    const day=id==='playlist_semanal'?'domingo':'miercoles';
    if(!playlistsPorDia[day].includes(data.canciones.add)) playlistsPorDia[day].push(data.canciones.add);
    renderizarLista();
}})})};
"""
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True)
    page = browser.new_page(service_workers='block', viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route(request):
        parsed = urlparse(request.request.url)
        if 'firebasejs' in request.request.url:
            request.fulfill(body='', content_type='application/javascript')
        elif parsed.netloc == '127.0.0.1:5500':
            relative = unquote(parsed.path).lstrip('/') or 'index.html'
            if relative == 'config.js':
                request.fulfill(body=CONFIG, content_type='application/javascript')
            else:
                target = (ROOT / relative).resolve()
                if ROOT not in target.parents or not target.is_file():
                    request.fulfill(status=404)
                else:
                    request.fulfill(path=str(target))
        elif 'sortablejs' in request.request.url:
            request.continue_()
        else:
            request.abort()

    page.route('**/*', route)
    page.goto('http://127.0.0.1:5500/index.html', wait_until='networkidle')
    page.evaluate("""() => {
        document.getElementById('loginModal').style.display='none';
        document.getElementById('splashScreen').style.display='none';
        usuarioActual={uid:'qa',email:'qa@example.test'};
        todasLasCanciones=[{id:'a',titulo:'Gracia sublime',artista:'Grupo'},
            {id:'b',titulo:'Gracia y paz',artista:'Artísta',tonoOriginal:'D'},
            {id:'c',titulo:'Otra canción',artista:'Otro'}];
        playlistsPorDia.domingo=['a','c']; playlistsPorDia.miercoles=[];
        cambiarTab('playlist');
    }""")
    search = page.locator('#searchInput')
    search.fill('gracia')
    assert page.locator('#songList .song-item').count() == 2
    assert page.locator('#songList .song-suggestion .drag-handle').count() == 0
    page.get_by_role('button', name='Agregar a Domingo', exact=True).click()
    page.wait_for_function('qaWrites.length===1 && !cancionesAgregandose.size')
    assert page.locator('#songList .song-suggestion').count() == 0
    assert page.locator('#viewSong').is_hidden(), 'Add action opened lyrics'
    page.evaluate("cambiarTab('wednesday')")
    search.fill('artista')
    assert page.get_by_role('button', name='Agregar a Miércoles', exact=True).is_visible()
    page.set_viewport_size({'width': 390, 'height': 844})
    button = page.get_by_role('button', name='Agregar a Miércoles', exact=True)
    box = button.bounding_box()
    assert box and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= 390
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    folder = ROOT / 'audio-service/.local'
    folder.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(folder / 'busqueda-listas-mobile.png'), full_page=True)
    button.click()
    page.wait_for_function('qaWrites.length===2 && !cancionesAgregandose.size')
    assert page.evaluate("qaWrites[1].id==='playlist_miercoles'")
    assert not errors, errors
    print('PASS: Chrome escritorio/móvil, agregar en ambos días sin abrir letra, sin desbordamientos ni errores JS; Firebase simulado.')
    browser.close()

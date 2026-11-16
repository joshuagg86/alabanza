"""Real Chrome/Web Audio checks with mocked identity/API and synthetic stems.

Uses the existing Live Server at :5500, never the user's Chrome profile.
Optional QA dependency: playwright==1.51.0 (no browser download needed on this Mac).
"""
import json
import sys
import time
from urllib.parse import urlparse
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / 'index.html').read_text()
FIXTURE = (ROOT / 'audio-service/.local/inputs/synthetic.wav').read_bytes()
STATE = {"state": "listo", "ready": True, "canPublish": True, "version": "test-version", "duration": 8, "frames": 352800, "stems": ["vocals","guitar","bass","piano","drums","other"]}

BOOT = """
document.getElementById('loginModal').style.display='none';
document.getElementById('splashScreen').style.display='none';
document.getElementById('viewSong').style.display='flex';
document.getElementById('viewTitle').textContent='Dios poderoso';
document.getElementById('viewArtist').textContent='IBI';
document.getElementById('songContent').innerHTML='<div class="section-block"><h3>CORO</h3><p>Dios poderoso<br>Tú gobiernas la creación</p></div>';
window.EnsayoMusical.abrir({id:'browser-song'}, firebase.auth().currentUser);
"""
USER = """
const qaUser = {uid:'qa',email:'admin@genesaret.com',emailVerified:true,getIdToken:async()=> 'qa-token'};
window.firebase = {auth:()=>({currentUser:qaUser})};
"""


def main():
    uploads = []
    pending_uploads = []
    cloud = "--cloud" in sys.argv
    cloud_url = "https://pkwiklslewgzcyiiyjek.supabase.co"
    export = ROOT/"audio-service/.local/exports/6df5fe836fb3eac4f33559841721f3f1ae3719a8e0df21db629fcdfd45331fb9"
    if cloud:
        manifest = json.loads((export/"web-manifest.json").read_text())
        STATE.update({"duration":manifest["duration"],"frames":manifest["frames"],"sampleRate":44100,"cloud":True,"expiresAt":int(time.time()*1000)+900000,
            "files":{name:cloud_url+"/storage/v1/object/sign/ensayo-audio/"+name+".m4a?token=qa" for name in manifest["stems"]}})
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        context = browser.new_context(service_workers='block', viewport={"width":1440,"height":1000})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""
            window.qaStarts=[];
            window.qaDecoded=[];
            const decode=AudioContext.prototype.decodeAudioData;
            AudioContext.prototype.decodeAudioData=async function(bytes){
                const buffer=await decode.call(this,bytes);
                qaDecoded.push({length:buffer.length,sampleRate:buffer.sampleRate,duration:buffer.duration});
                return buffer;
            };
            const createSource=AudioContext.prototype.createBufferSource;
            AudioContext.prototype.createBufferSource=function(){
                const source=createSource.call(this), start=source.start.bind(source);
                source.start=(when,offset)=>{window.qaStarts.push([when,offset]);start(when,offset)};
                return source;
            };
        """)

        def route(request):
            url = request.request.url
            if cloud and url.endswith('/rehearsal-cloud-config.js'):
                request.fulfill(body='window.REHEARSAL_CLOUD='+json.dumps({'url':cloud_url,'enabled':True,'publishableKey':'public-test-key'}),content_type='application/javascript')
            elif cloud and url.startswith(cloud_url):
                headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5500','Access-Control-Allow-Headers':'authorization,apikey,content-type'}
                if request.request.method=='OPTIONS':
                    request.fulfill(status=200,headers=headers)
                elif '/storage/' in url:
                    request.fulfill(body=(export/Path(urlparse(url).path).name).read_bytes(),content_type='audio/mp4',headers=headers)
                else:
                    request.fulfill(body=json.dumps(STATE),content_type='application/json',headers=headers)
            elif cloud and url.startswith('http://127.0.0.1:8765'):
                request.abort()
            elif url.startswith('http://127.0.0.1:8765'):
                headers = {'Access-Control-Allow-Origin': 'http://127.0.0.1:5500',
                    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
                    'Access-Control-Allow-Methods': 'GET,POST', 'Cache-Control':'no-store'}
                if request.request.method == 'OPTIONS':
                    request.fulfill(status=200, headers=headers)
                elif '/stems/' in url:
                    request.fulfill(status=200, body=FIXTURE, content_type='audio/wav', headers=headers)
                elif request.request.method == 'POST':
                    uploads.append(request.request.post_data_buffer)
                    pending_uploads.append((request, headers))
                else:
                    request.fulfill(status=200, body=json.dumps(STATE), content_type='application/json', headers=headers)
            elif url.endswith('/index.html'):
                request.fulfill(body=HTML, content_type='text/html')
            elif 'firebasejs' in url or url.endswith('/config.js'):
                request.fulfill(body=USER if url.endswith('/config.js') else '', content_type='application/javascript')
            elif url.endswith('/index-app.js'):
                request.fulfill(body=BOOT, content_type='application/javascript')
            elif not url.startswith('http://127.0.0.1:5500'):
                request.fulfill(body='', content_type='text/css' if '.css' in url or 'fonts.google' in url else 'application/javascript')
            else:
                request.continue_()

        page.route('**/*', route)
        page.goto('http://127.0.0.1:5500/index.html')
        page.wait_for_timeout(500)
        if errors:
            raise AssertionError('Startup errors: '+repr(errors))
        page.get_by_role('button', name='Ensayar', exact=True).click()
        page.wait_for_function("!document.getElementById('rehearsalPlay').disabled")
        page.get_by_role('button', name='Cargar y reproducir', exact=True).click()
        try:
            page.get_by_role('button', name='Pausar', exact=True).wait_for()
        except Exception:
            print('Browser message:',page.locator('#rehearsalMessage').inner_text(),'JS errors:',errors)
            print('Decoded buffers:',page.evaluate('qaDecoded'),'Expected frames:',STATE['frames'])
            raise
        assert page.evaluate('qaStarts.length===6 && qaStarts.every(s=>s[0]===qaStarts[0][0] && s[1]===0)')
        page.wait_for_function("Number(document.getElementById('rehearsalTimeline').value)>0.1")
        page.get_by_role('button', name='Pausar', exact=True).click()
        before = page.locator('#rehearsalTimeline').input_value()
        page.wait_for_timeout(200)
        assert page.locator('#rehearsalTimeline').input_value() == before
        page.locator('#mix-volume-vocals').fill('42')
        assert page.locator('#mix-level-vocals').inner_text() == '42%'
        page.locator('#mix-solo-drums').click()
        assert page.locator('#mix-channel-vocals').get_attribute('data-silent') == 'true'
        page.locator('#mix-mute-drums').click()
        assert page.locator('#mix-channel-drums').get_attribute('data-silent') == 'true'
        page.locator('#rehearsalPreset').select_option('without:bass')
        assert page.locator('#mix-mute-bass').get_attribute('aria-pressed') == 'true'
        page.locator('#rehearsalReset').click()
        assert page.locator('#mix-level-vocals').inner_text() == '100%'
        for name in ('guitar', 'piano'):
            page.locator('#rehearsalPreset').select_option('without:'+name)
            assert page.locator('#mix-mute-'+name).get_attribute('aria-pressed') == 'true'
            page.locator('#mix-solo-'+name).click()
            assert page.locator('#mix-solo-'+name).get_attribute('aria-pressed') == 'true'
        page.locator('#rehearsalReset').click()
        page.locator('#rehearsalTimeline').fill('4')
        page.wait_for_function("document.getElementById('rehearsalElapsed').textContent==='0:04'")
        page.locator('#rehearsalPlay').click()
        page.get_by_role('button', name='Pausar', exact=True).wait_for()
        assert page.evaluate('qaStarts.slice(-6).every(s=>s[0]===qaStarts.at(-1)[0] && s[1]===4)')
        page.locator('#rehearsalPlay').click()
        page.on('dialog', lambda dialog: dialog.accept())
        if not cloud:
            page.locator('#rehearsalFile').set_input_files({"name":"test.wav", "mimeType":"audio/wav", "buffer": FIXTURE})
            page.wait_for_function("document.getElementById('rehearsalSummary').textContent.includes('Subiendo canción')")
            assert page.locator('#rehearsalUpload').inner_text() == 'Subiendo canción…'
            assert page.locator('#rehearsalUpload').is_disabled()
            assert page.locator('#rehearsalRefresh').is_disabled()
            assert 'test.wav' in page.locator('#rehearsalMessage').inner_text()
            page.wait_for_timeout(100)
            assert uploads == [FIXTURE]
            pending, headers = pending_uploads.pop()
            pending.fulfill(status=202, body='{"state":"pendiente"}', content_type='application/json', headers=headers)
            page.wait_for_function("!document.getElementById('rehearsalUpload').disabled")
        else:
            assert "nube" in page.locator("#rehearsalLocation").inner_text()
        assert 'Dios poderoso' in page.locator('#songContent').inner_text()
        page.screenshot(path=str(ROOT/'audio-service/.local/mixer-desktop.png'))
        page.set_viewport_size({"width":390,"height":844})
        page.wait_for_timeout(100)
        panel = page.locator('#rehearsalPanel').bounding_box()
        assert panel and panel['x'] >= 0 and panel['x']+panel['width'] <= 391
        assert page.locator('#songContent').bounding_box()['height'] >= 95
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(ROOT/'audio-service/.local/mixer-mobile.png'))
        page.evaluate('window.EnsayoMusical.cerrar()')
        assert page.locator('#rehearsalPanel').is_hidden()
        STATE['stems'] = ['vocals','drums','bass','other']
        page.reload()
        page.get_by_role('button', name='Ensayar', exact=True).click()
        page.get_by_role('button', name='Cargar y reproducir', exact=True).click()
        page.get_by_role('button', name='Pausar', exact=True).wait_for()
        assert page.evaluate('qaStarts.length===4')
        assert page.locator('#mix-channel-guitar').is_hidden()
        assert page.locator('#mix-channel-piano').is_hidden()
        assert not errors, errors
        print('PASS: Chrome desktop/mobile, '+('AAC real de Dios poderoso con servicio Mac desconectado' if cloud else 'WAV local')+', play/pause/seek, Mute/Solo, presets y compatibilidad anterior; identidad/API simuladas')
        browser.close()


if __name__ == '__main__':
    main()

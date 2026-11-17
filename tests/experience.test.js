let testResult = 'PENDING';
const passed = [];
function assert(value, message) { if (!value) throw Error(message); }
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function snapshot(docs, fromCache = false) {
    return { metadata: { fromCache, hasPendingWrites: false }, forEach(fn) { docs.forEach(([id, data]) => fn({ id, data: () => data })); } };
}
const testPromise = (async () => {
    assert(detectarSeccionAutomatica('Coronado con poder') === null, 'Coronado became a reader section');
    assert(detectarSeccionAutomatica('Coro de voces') === null, 'Coro lyric became a reader section');
    for (const heading of ['Coro', 'CORO:', 'Coro 2', 'Coro x2', 'Pre-coro', 'Verso 1']) {
        assert(detectarSeccionAutomatica(heading), 'Reader lost section: ' + heading);
    }
    passed.push('Coro completo sin confundir Coronado con una sección');
    assert(Permisos.puedeEditar({ uid: 'ordinary', email: 'ordinary@example.test' }), 'Ordinary user cannot collaborate');
    assert(!Permisos.puedeEditar(null), 'Guest can edit');
    assert(!Permisos.puedeEliminar({ uid: 'ordinary', email: 'ordinary@example.test' }), 'Deletion privileges expanded');
    assert(Permisos.puedeEliminar({ uid: 'admin', email: 'joshua@genesaret.com' }), 'Administrator deletion regressed');
    usuarioActual = { uid: 'ordinary', email: 'ordinary@example.test' };
    const roleCard = crearTarjetaRol({ id: 'r1', fecha: '2026-11-18', direccion: 'Equipo', modalidad: 'completo' }, false);
    const actions = roleCard.children.find(child => child.className === 'service-role-actions');
    assert(actions && actions.children.length === 1 && actions.children[0].textContent === 'Editar', 'Role editing is still restricted');
    cargarRolServicio(); assert(document.getElementById('btnNuevoRol').style.display === 'block', 'Role creation is still hidden');
    usuarioActual = null; cargarRolServicio(); assert(document.getElementById('btnNuevoRol').style.display === 'none', 'Guest sees role creation');
    passed.push('colaboración para usuarios con sesión');

    // Parse corrupted storage without preventing the reader from opening.
    localStorage.setItem('bad', '{broken');
    assert(ExperienciaLectura.leer('bad', 42) === 42, 'Corrupt storage blocked reader');
    const unavailable = { setItem() { throw Error('quota'); } };
    assert(!ExperienciaLectura.guardar('x', 1, unavailable), 'Storage failure not handled');
    passed.push('almacenamiento');

    usuarioActual = { uid: 'u1', email: 'user@example.test' };
    cancionActual = { id: 'song-a' };
    rolActual = 'voz';
    tamanoLectura = 24; tamanoBateria = 17; lecturaContinua = true;
    document.getElementById('readerScrollSpeed').value = '1.5';
    document.body.classList.add('hide-chords');
    guardarPreferenciasCancion();
    cancionActual = { id: 'song-b' }; cargarPreferenciasCancion();
    assert(tamanoLectura === 19, 'Preferences leaked across songs');
    cancionActual = { id: 'song-a' }; cargarPreferenciasCancion();
    assert(tamanoLectura === 24 && tamanoBateria === 17 && lecturaContinua, 'Song preferences not restored');
    assert(document.getElementById('readerScrollSpeed').value === '1.5', 'Speed not restored');
    usuarioActual = { uid: 'u2', email: 'other@example.test' }; cargarPreferenciasCancion();
    assert(tamanoLectura === 19, 'Preferences leaked across users');
    usuarioActual = { uid: 'u1', email: 'user@example.test' };
    passed.push('preferencias por canción y usuario');

    // Load both legacy and canonical notes through the owned-documents query.
    let renders = 0;
    const realRender = renderizarLetra;
    renderizarLetra = () => { renders++; };
    document.getElementById('viewSong').style.display = 'flex';
    iniciarNotasPersonales();
    noteSnapshot(snapshot([
        ['old-note-id', { cancionId: 'song-a', notas: { 1: 'Entrada antigua', 2: 'Redoble' } }],
        ['u1_song-a', { cancionId: 'song-a', notas: { 1: 'Entrada actual' } }]
    ]));
    assert(notasDeLaCancion[1] === 'Entrada actual' && notasDeLaCancion[2] === 'Redoble', 'Legacy notes lost');
    assert(notasLocales.canciones['song-a'].documento === 'u1_song-a', 'Canonical destination not preferred');
    navigator.onLine = false;
    guardarNotaEnNube(3, 'Cierre');
    assert(notasDeLaCancion[3] === 'Cierre', 'Offline note not visible');
    const persisted = ExperienciaLectura.leer(claveNotasLocales());
    assert(persisted.canciones['song-a'].pendientes[3].texto === 'Cierre', 'Offline note not durable');
    notasLocales = persisted; mostrarNotasActuales();
    assert(notasDeLaCancion[3] === 'Cierre', 'Reload lost pending offline note');
    noteSnapshot(snapshot([], true));
    assert(notasDeLaCancion[2] === 'Redoble', 'Empty cache erased local notes');
    navigator.onLine = true;
    sincronizarNotasPendientes();
    assert(writes.length === 1 && Object.keys(writes[0].data.notas).length === 1, 'Write overwrites unrelated annotations');
    guardarNotaEnNube(3, 'Cierre nuevo');
    heldWrites.shift()(); await settle();
    assert(notasLocales.canciones['song-a'].pendientes[3].texto === 'Cierre nuevo', 'Older save acknowledged newer edit');
    assert(writes.length === 2, 'Newer edit not sent');
    heldWrites.shift()(); await settle();
    assert(!notasLocales.canciones['song-a'].pendientes[3] && notasDeLaCancion[3] === 'Cierre nuevo', 'Pending edit not confirmed');
    const antesEliminar = writes.length;
    guardarNotaEnNube(2, null);
    assert(writes.length === antesEliminar + 2, 'Deletion did not clear both legacy and canonical documents');
    while (heldWrites.length) heldWrites.shift()(); await settle();
    assert(!notasDeLaCancion[2], 'Deleted legacy note still visible');
    serverFailure = true; guardarNotaEnNube(4, 'No perder'); await settle();
    assert(notasLocales.canciones['song-a'].pendientes[4], 'Rejected save discarded the comment');
    noteError(Error('permission-denied'));
    assert(notasDeLaCancion[4] === 'No perder', 'Sync failure hid local comment');
    assert(typeof activeNoteSnapshot === 'function', 'Missing fallback for rules that disallow queries');
    activeNoteSnapshot({ exists: true, metadata: { hasPendingWrites: false }, data() { return { notas: { 5: 'Lectura individual' } }; } });
    assert(notasDeLaCancion[5] === 'Lectura individual' && notasDeLaCancion[4] === 'No perder', 'Individual document fallback lost cloud or pending notes');
    passed.push('notas antiguas, offline, concurrencia y errores');

    // The reader always renders independently of note retrieval.
    const before = renders; cargarNotasYRenderizar();
    assert(renders === before + 1, 'Lyrics still wait for cloud annotations');
    passed.push('letra independiente de la nube');

    const status = testElement(); testQueries.set('[data-connection-status]', [status]);
    notasLocales = { canciones: {}, sincronizadas: true }; errorNotas = false;
    estadoConexion.canciones = true; estadoConexion.listas = { domingo: true, miercoles: true };
    estadoConexion.archivos = false; estadoConexion.pendientes = {};
    verificarEstadoTotal(); assert(status.dataset.state !== 'ready', 'Offline readiness claimed without app files');
    estadoConexion.archivos = true; verificarEstadoTotal(); assert(status.dataset.state === 'ready', 'Prepared library not ready');
    navigator.onLine = false; verificarEstadoTotal(); assert(status.textContent.includes('Sin conexión'), 'Offline status missing');
    estadoConexion.pendientes.notas = true; verificarEstadoTotal(); assert(status.dataset.state === 'pending', 'Pending writes hidden');
    navigator.onLine = true;
    passed.push('disponibilidad offline veraz');

    // Section selection follows manual/automatic scrolling, including the final section.
    const content = document.getElementById('songContent');
    content.querySelector = () => null;
    content.getBoundingClientRect = () => ({ top: 100, bottom: 600, left: 0, right: 300 });
    const nav = document.getElementById('songStructure');
    nav.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
    let positions = [80, 300];
    const blocks = [testElement(), testElement()];
    seccionesLectura = positions.map((_, i) => {
        const linea = testElement(), boton = testElement();
        linea.getBoundingClientRect = () => ({ top: positions[i], left: 0, right: 250 });
        linea.closest = () => blocks[i];
        return { linea, boton };
    });
    testQueries.set('#songContent .section-selected', blocks);
    const realQuery = document.querySelectorAll.bind(document);
    document.querySelectorAll = selector => selector === '#songStructure [aria-current]' ? seccionesLectura.map(s => s.boton).filter(b => b.hasAttribute('aria-current')) : realQuery(selector);
    content.scrollTop = 100; actualizarSeccionVisible();
    assert(seccionesLectura[0].boton.hasAttribute('aria-current'), 'First section not active');
    positions = [-200, 120]; actualizarSeccionVisible();
    assert(seccionesLectura[1].boton.hasAttribute('aria-current') && !seccionesLectura[0].boton.hasAttribute('aria-current'), 'Section failed to follow scroll');
    passed.push('seguimiento de secciones');

    actualizarVisibilidadSecciones();
    assert(!nav.hidden, 'Sections should start visible');
    alternarSeccionesLectura();
    assert(nav.hidden && document.getElementById('readerSections').getAttribute('aria-expanded') === 'false', 'Sections did not collapse');
    actualizarVisibilidadSecciones();
    assert(nav.hidden, 'Re-render forgot collapsed navigation');
    alternarSeccionesLectura();
    assert(!nav.hidden && document.getElementById('readerSections').getAttribute('aria-expanded') === 'true', 'Cannot restore navigation');
    const savedSections = seccionesLectura;
    seccionesLectura = []; actualizarVisibilidadSecciones();
    assert(nav.hidden && document.getElementById('readerSections').hidden, 'Empty section navigation remains visible');
    seccionesLectura = savedSections; actualizarVisibilidadSecciones();
    passed.push('ocultar y restaurar navegación por secciones');

    // Restore position by lyric anchor, then consume the return exactly once.
    const anchor = testElement(); anchor.dataset.index = '12';
    anchor.getBoundingClientRect = () => ({ top: 240, bottom: 280 });
    content.querySelectorAll = () => [anchor]; content.scrollTop = 100;
    window.location.href = 'https://example.test/index.html?song=song-a&saved=1';
    retornoEditorPendiente = { indice: '12', offset: 30, scroll: 0 };
    restaurarRetornoEditor();
    assert(content.scrollTop === 210 && retornoEditorPendiente === null, 'Editor return position wrong');
    assert(document.getElementById('readerToast').textContent === 'Canción guardada', 'Save confirmation missing');
    ExperienciaLectura.guardar('alabanza_editor_return', { uid: 'u1', cancion: 'song-a', fecha: Date.now() }, sessionStorage);
    assert(!ExperienciaLectura.retorno('u2', 'song-a'), 'Editor return leaked across users');
    assert(ExperienciaLectura.retorno('u1', 'song-a'), 'Valid editor return rejected');
    passed.push('regreso al editor y confirmación');

    establecerModoEnsayo(true);
    assert(document.getElementById('viewSong').classList.contains('rehearsal-mode'), 'Rehearsal did not activate');
    establecerModoEnsayo(false);
    assert(!document.getElementById('viewSong').classList.contains('rehearsal-mode'), 'Cannot exit rehearsal');
    passed.push('modo ensayo');

    // Keep fractional motion so slower speeds work even with integer scrollTop browsers.
    lecturaContinua = true; desplazamientoActivo = true; desplazamientoTiempo = null; desplazamientoPosicion = 0;
    content.scrollTop = 0; content.querySelector = () => testElement();
    currentBpm = 120; currentTimeSig = '4/4'; document.getElementById('readerScrollSpeed').value = '1';
    avanzarDesplazamientoLetra(0);
    for (let t = 100; t <= 1000; t += 100) avanzarDesplazamientoLetra(t);
    assert(Math.abs(content.scrollTop - 15) < 0.01, 'Auto-scroll tempo regressed');
    pausarDesplazamientoLetra(); assert(!desplazamientoActivo, 'Auto-scroll cannot pause');
    passed.push('avance automático');
    renderizarLetra = realRender;
    cancionActual = { id: 'render-check', letraChordPro: 'Estrofa 1:\nPrimera línea de prueba\n[INICIO-SOLO-GT]\nLínea reservada\n[FIN-SOLO-GT]\nCoro:\nSegunda línea de prueba' };
    notasDeLaCancion = { 1: 'Entrada <suave>', 3: '_Recordatorio' };
    rolActual = 'voz'; semitonos = 0;
    realRender();
    assert(content.innerHTML.includes('Primera línea de prueba') && content.innerHTML.includes('Segunda línea de prueba'), 'Reader lost visible lyrics');
    assert(!content.innerHTML.includes('Línea reservada') && content.innerHTML.includes('Recordatorio'), 'Role filter hides personal note');
    assert(content.innerHTML.includes('Entrada &lt;suave&gt;'), 'Note HTML escaping regressed');
    passed.push('renderizado real y filtros por instrumento');
    testResult = 'PASS (' + passed.length + '): ' + passed.join('; ');
})().catch(error => { testResult = 'FAIL: ' + error.message + '\n' + error.stack; });

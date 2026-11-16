let testResult = 'PENDING';
function assert(value, message) { if (!value) throw Error(message); }
const testPromise = (async () => {
    Servicios.dias.domingo = { nombre: 'Domingo', documento: 'playlist_semanal' };
    Servicios.dias.miercoles = { nombre: 'Miércoles', documento: 'playlist_miercoles' };
    usuarioActual = { uid: 'member', email: 'member@example.test' };
    todasLasCanciones = [
        { id: 'a', titulo: 'Gracia sublime', artista: 'Grupo' },
        { id: 'b', titulo: 'Gracia y paz', artista: 'Artísta' },
        { id: 'c', titulo: 'Otra canción', artista: 'Otro' }
    ];
    playlistsPorDia.domingo = ['a', 'c'];
    playlistsPorDia.miercoles = [];
    servicioActual = 'domingo'; tabActual = 'playlist';
    const search = document.getElementById('searchInput');
    const list = document.getElementById('songList');
    search.value = ''; renderizarLista();
    assert(!list.innerHTML.includes('data-id="b"'), 'Unfiltered service includes unselected songs');
    search.value = 'gracia'; renderizarLista();
    assert(list.innerHTML.includes('data-id="a"') && list.innerHTML.includes('data-id="b"'), 'Search misses list or repertoire');
    assert(!list.innerHTML.includes('data-id="c"'), 'Unmatched list song appears');
    assert(list.innerHTML.includes('Agregar a Domingo') && list.innerHTML.includes('song-suggestion'), 'Missing add action');
    assert((list.innerHTML.match(/drag-handle/g) || []).length === 1, 'Suggestion is draggable');
    const actualizarOriginal = actualizarVistaCancion;
    actualizarVistaCancion = () => {};
    abrirCancion('b');
    assert(listaNavegacionActual.join(',') === 'a,b' && indiceNavegacion === 1, 'Repertoire preview has wrong navigation');
    actualizarVistaCancion = actualizarOriginal;
    search.value = 'artista'; renderizarLista();
    assert(list.innerHTML.includes('data-id="b"') && !list.innerHTML.includes('Sin coincidencias'), 'Accent-insensitive artist search fails');
    const calls = []; let finish, fail;
    firebase.firestore.FieldValue.arrayUnion = id => ({ arrayUnion: id });
    db.collection = name => {
        assert(name === 'configuracion', 'Writes a different collection');
        return { doc: id => ({ set: (data, options) => {
            calls.push({ id, data, options });
            return new Promise((resolve, reject) => { finish = resolve; fail = reject; });
        } }) };
    };
    let stopped = 0;
    const event = { stopPropagation() { stopped++; } };
    const pending = agregarALista('b', event);
    agregarALista('b', event);
    assert(stopped === 2 && calls.length === 1, 'Double click duplicated a write');
    assert(list.innerHTML.includes('Agregando…') && list.innerHTML.includes('disabled'), 'Missing progress indicator');
    assert(calls[0].id === 'playlist_semanal' && calls[0].data.canciones.arrayUnion === 'b' && calls[0].options.merge, 'Write replaces list or targets wrong day');
    servicioActual = 'miercoles'; tabActual = 'wednesday';
    playlistsPorDia.domingo.push('b'); finish(); await pending;
    assert(list.innerHTML.includes('Agregar a Miércoles'), 'Day switch lost destination');
    const wednesday = agregarALista('b', event);
    assert(calls[1].id === 'playlist_miercoles', 'Wednesday writes Sunday');
    playlistsPorDia.miercoles.push('b'); finish(); await wednesday;
    assert(!list.innerHTML.includes('song-suggestion') && (list.innerHTML.match(/data-id="b"/g) || []).length === 1, 'Added song duplicated or still suggested');
    search.value = 'otra'; renderizarLista();
    let alertShown = false;
    Modal.alert = () => { alertShown = true; };
    const failed = agregarALista('c', event); fail(Error('permission-denied')); await failed;
    assert(alertShown && !cancionesAgregandose.size && list.innerHTML.includes('Agregar a Miércoles'), 'Failure hides retry or retains pending state');
    usuarioActual = null; const before = calls.length;
    agregarALista('c', event); assert(calls.length === before, 'Guest can write');
    testResult = 'PASS (listas): búsqueda por título/artista, ambos días, adición atómica, duplicados, progreso, errores y permisos';
})().catch(error => { testResult = 'FAIL: ' + error.message + '\n' + error.stack; });

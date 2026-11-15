let testResult = 'PENDING';
function assert(v, message) { if (!v) throw Error(message); }
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function switchTab() {}
const testPromise = (async () => {
    let finishSave, rejectSave, saveCalls = 0;
    window.db = { collection() { return {
        doc(id) { assert(id === 'song-edited', 'Saving the wrong song'); return {
            update() { saveCalls++; return new Promise((resolve, reject) => { finishSave = resolve; rejectSave = reject; }); }
        }; },
        add() { return Promise.resolve({ id: 'new-song' }); }
    }; } };
    ['titulo', 'artista', 'tono', 'bpm', 'compas', 'letraInput'].forEach(id => { document.getElementById(id).value = id === 'bpm' ? '120' : 'Contenido de prueba'; });
    document.getElementById('bpm').checkValidity = () => true;
    testAuth.currentUser = { uid: 'ordinary', email: 'ordinary@example.test' };
    idCancionEditando = 'song-edited';
    window.location.href = 'admin.html';
    guardarCancion();
    assert(window.location.href === 'admin.html', 'Navigates before confirmation');
    rejectSave(Error('offline')); await settle();
    assert(window.location.href === 'admin.html' && idCancionEditando === 'song-edited', 'Failure lost the editor');
    assert(document.getElementById('letraInput').value === 'Contenido de prueba', 'Failure cleared lyrics');
    guardarCancion(); finishSave(); await settle();
    assert(window.location.href === 'index.html?song=song-edited&saved=1', 'Saved editor does not return to the song');
    idCancionEditando = null; window.location.href = 'admin.html';
    guardarCancion(); await settle();
    assert(window.location.href === 'admin.html' && document.getElementById('titulo').value === '', 'New-song flow regressed');
    testAuth.currentUser = null;
    const beforeGuest = saveCalls; guardarCancion();
    assert(saveCalls === beforeGuest, 'Signed-out editor can save');
    testAuth.currentUser = { uid: 'ordinary', email: 'ordinary@example.test' };
    window.todasLasCancionesAdmin = [{ id: 'song-edited', titulo: 'Prueba', letraChordPro: 'Contenido de prueba', compas: '4/4' }];
    cargarParaEditar('song-edited');
    assert(document.getElementById('btnDelete').style.display === 'none', 'Ordinary editor sees deletion');
    testResult = 'PASS (editor): confirma guardado, conserva contenido al fallar y regresa a la canción';
})().catch(error => { testResult = 'FAIL: ' + error.message + '\n' + error.stack; });

let testResult = 'PENDING', paso = 'install';
function assert(v, message) { if (!v) throw Error(message); }
async function workerRequest(url, mode = 'cors') {
    let response;
    workerEvents.fetch({ request: { url, mode, method: 'GET' }, respondWith(value) { response = value; } });
    return response;
}
const testPromise = (async () => {
    let installation;
    workerEvents.install({ waitUntil(value) { installation = value; } });
    await installation;
    assert(workerInstalled && cacheEntries.has('./reader-experience.js'), 'Reader module not precached');
    assert(cacheEntries.has('./permissions.js'), 'Permission module not available offline');
    assert(cacheEntries.has('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js'), 'Offline auth SDK missing');
    paso = 'online script';
    const online = await workerRequest('https://example.test/index-app.js');
    assert(online.text.startsWith('network:'), 'Interface not refreshed online');
    workerOffline = true;
    paso = 'offline script';
    const offline = await workerRequest('https://example.test/index-app.js');
    assert(offline.text === online.text, 'Cached script unavailable offline');
    paso = 'offline deep link';
    const deepLink = await workerRequest('https://example.test/index.html?song=edited&saved=1', 'navigate');
    assert(deepLink.text === './index.html', 'Offline editor return has no document');
    paso = 'online font';
    workerOffline = false;
    await workerRequest('https://fonts.gstatic.com/test-font.woff2');
    workerOffline = true;
    paso = 'offline font';
    const font = await workerRequest('https://fonts.gstatic.com/test-font.woff2');
    assert(font.text.startsWith('network:'), 'External assets not cached at runtime');
    testResult = 'PASS (offline): instalación, SDK de Firebase, interfaz, regreso del editor y recursos externos';
})().catch(error => { testResult = 'FAIL (' + paso + '): ' + error.message + '\n' + error.stack; });

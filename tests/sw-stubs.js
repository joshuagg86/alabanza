const workerEvents = {}, cacheEntries = new Map();
let workerOffline = false, workerInstalled = false;
const self = {
    location: { origin: 'https://example.test' },
    addEventListener(type, callback) { workerEvents[type] = callback; },
    skipWaiting() { workerInstalled = true; }, clients: { claim() {} }
};
function reply(text) { return { ok: true, text, clone() { return reply(text); } }; }
function cacheKey(request) { return typeof request === 'string' ? request : request.url; }
const caches = {
    async open() { return {
        async match(request) { return cacheEntries.get(cacheKey(request)); },
        async put(request, response) { cacheEntries.set(cacheKey(request), response); },
        async addAll(urls) { urls.forEach(url => cacheEntries.set(url, reply(url))); },
        async add(url) { if (url.includes('/pads/')) throw Error('Optional audio unavailable'); cacheEntries.set(url, reply(url)); }
    }; },
    async keys() { return []; }
};
async function fetch(request) { if (workerOffline) throw Error('offline'); return reply('network:' + cacheKey(request)); }
// The worker uses URL only to inspect the origin and pathname of absolute requests.
if (typeof URL === 'undefined') globalThis.URL = class {
    constructor(value) { this.origin = value.match(/^https?:\/\/[^/]+/)[0]; this.hostname = this.origin.replace(/^https?:\/\//, ''); this.pathname = value.slice(this.origin.length).split('?')[0]; }
};

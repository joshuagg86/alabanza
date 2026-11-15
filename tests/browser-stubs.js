// Minimal browser boundary for running the actual scripts without Firebase or a GUI.
const testElements = new Map();
const testQueries = new Map();
const testFrames = new Map();
let nextTestFrame = 0;
function requestAnimationFrame(fn) { const id = ++nextTestFrame; testFrames.set(id, fn); return id; }
function cancelAnimationFrame(id) { testFrames.delete(id); }
function setTimeout() { return 1; }
function clearTimeout() {}
function testStorage() {
    const data = new Map();
    return { getItem(k) { return data.get(k) ?? null; }, setItem(k, v) { data.set(k, String(v)); }, removeItem(k) { data.delete(k); } };
}
const localStorage = testStorage(), sessionStorage = testStorage();
function testElement() {
    const classes = new Set(), attributes = new Map();
    return {
        style: { setProperty() {} }, dataset: {}, value: '', children: [], textContent: '',
        scrollTop: 0, scrollHeight: 2000, clientHeight: 500,
        classList: { add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); }, contains(n) { return classes.has(n); }, toggle(n, force) { const add = force ?? !classes.has(n); add ? classes.add(n) : classes.delete(n); return add; } },
        setAttribute(k, v) { attributes.set(k, v); }, getAttribute(k) { return attributes.get(k); }, hasAttribute(k) { return attributes.has(k); }, removeAttribute(k) { attributes.delete(k); },
        querySelector() { return this.child || (this.child = testElement()); }, querySelectorAll() { return []; },
        replaceChildren() { this.children = []; }, append(el) { this.children.push(el); },
        addEventListener(type, fn) { (this.events ||= {})[type] = fn; },
        getBoundingClientRect() { return { top: 0, bottom: 44, left: 0, right: 300 }; },
        focus() { document.activeElement = this; }, scrollTo({ top }) { this.scrollTop = top; }
    };
}
const document = {
    hidden: false, body: testElement(),
    getElementById(id) { if (!testElements.has(id)) testElements.set(id, testElement()); return testElements.get(id); },
    querySelectorAll(selector) { return testQueries.get(selector) || []; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    createElement: testElement, createTextNode(text) { return { textContent: text }; }, addEventListener() {}
};
const window = {
    location: { search: '', href: 'https://example.test/index.html', pathname: '/index.html', protocol: 'https:', host: 'example.test' },
    history: { replaceState() {}, pushState() {} },
    addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; },
    persistenciaDisponible: true
};
const navigator = { onLine: true };
const console = { log() {}, warn() {}, error() {} };
const testAuth = { currentUser: { uid: 'u1', email: 'user@example.test' }, onAuthStateChanged() {} };
const firebase = { auth() { return testAuth; }, firestore: { FieldValue: { delete() { return '__DELETE__'; } } } };
const Servicios = { dias: { domingo: {}, miercoles: {} } };
function getComputedStyle() { return { lineHeight: '30px' }; }
let noteSnapshot, noteError, activeNoteSnapshot, writes = [], serverFailure = false, heldWrites = [];
const db = window.db = {
    collection(name) {
        if (name !== 'notas_personales') throw Error('Unexpected collection ' + name);
        return {
            where(field, op, value) {
                if (field !== 'usuarioEmail' || op !== '==') throw Error('Query must be scoped to the user');
                return { onSnapshot(options, next, error) { noteSnapshot = next; noteError = error; return () => {}; } };
            },
            doc(id) { return { onSnapshot(options, next) { activeNoteSnapshot = next; return () => {}; }, set(data) {
                writes.push({ id, data });
                if (serverFailure) return Promise.reject(Error('permission-denied'));
                return new Promise(resolve => heldWrites.push(resolve));
            } }; }
        };
    }
};
// JavaScriptCore does not ship the browser URL globals.
if (typeof URLSearchParams === 'undefined') globalThis.URLSearchParams = class {
    constructor(query = '') { this.values = new Map(query.replace(/^\?/, '').split('&').filter(Boolean).map(item => item.split('=').map(decodeURIComponent))); }
    get(key) { return this.values.get(key) ?? null; }
    delete(key) { this.values.delete(key); }
    toString() { return Array.from(this.values, ([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }
};
if (typeof URL === 'undefined') globalThis.URL = class {
    constructor(value) { this.href = value; this.searchParams = new URLSearchParams(value.split('?')[1] || ''); }
};
testQueries.set('.mobile-tabs', [testElement()]);

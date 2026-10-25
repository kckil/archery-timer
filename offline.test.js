const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const workerSource = readFileSync(`${__dirname}/sw.js`, 'utf8');

function createWorker(path = '/', failDownload = false) {
    const listeners = new Map();
    const stores = new Map();
    const network = [];
    const caches = {
        async open(name) {
            if (!stores.has(name)) {
                const entries = new Map();
                stores.set(name, {
                    async addAll(requests) {
                        if (failDownload) throw new Error('Download failed');
                        for (const request of requests) entries.set(request.url, request.url);
                    },
                    async match(url) { return entries.get(url); }
                });
            }
            return stores.get(name);
        },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); }
    };
    vm.runInNewContext(workerSource, {
        self: {
            location: { href: `https://example.com${path}sw.js` },
            addEventListener: (type, callback) => listeners.set(type, callback)
        },
        caches,
        URL,
        Request,
        fetch: async request => {
            network.push(request.url);
            return 'network';
        }
    });
    return {
        caches, network,
        async lifecycle(type) {
            let promise;
            listeners.get(type)({ waitUntil: result => { promise = result; } });
            await promise;
        },
        async request(url, mode = 'navigate', method = 'GET') {
            let promise;
            listeners.get('fetch')({
                request: { url, mode, method },
                respondWith: result => { promise = result; }
            });
            return promise;
        }
    };
}

for (const path of ['/', '/archery-timer/']) {
    test(`precaches a complete app and serves unseen settings URLs offline at ${path}`, async () => {
        const worker = createWorker(path);
        await worker.lifecycle('install');
        const root = `https://example.com${path}`;
        assert.equal(await worker.request(`${root}?lines=2&timeShoot=60`), `${root}index.html`);
        assert.equal(await worker.request(`${root}index.html?lines=1`), `${root}index.html`);
        assert.equal(await worker.request(`${root}script.js`, 'cors'), `${root}script.js`);
        assert.equal(await worker.request(`${root}style.css?v=2`, 'cors'), `${root}style.css`);
        assert.equal(await worker.request(`${root}icons/icon-192.png`, 'cors'), `${root}icons/icon-192.png`);
        assert.equal(await worker.request(`${root}audio/silence.wav`, 'cors'), `${root}audio/silence.wav`);
        assert.deepEqual(worker.network, []);
    });
}

test('failed precaching rejects installation rather than declaring the app offline-ready', async () => {
    const worker = createWorker('/', true);
    await assert.rejects(worker.lifecycle('install'), /Download failed/);
});

test('activation only removes old caches belonging to this app scope', async () => {
    const worker = createWorker('/archery-timer/');
    await worker.lifecycle('install');
    const [current] = await worker.caches.keys();
    await worker.caches.open('archery-timer:/archery-timer/:old');
    await worker.caches.open('archery-timer:/another-app/:v1');
    await worker.caches.open('unrelated-cache');
    await worker.lifecycle('activate');
    assert.deepEqual(await worker.caches.keys(), [
        current, 'archery-timer:/another-app/:v1', 'unrelated-cache'
    ]);
});

test('does not intercept external requests, unknown pages, or non-GET requests', async () => {
    const worker = createWorker('/archery-timer/');
    await worker.lifecycle('install');
    assert.equal(await worker.request('https://other.example/script.js'), undefined);
    assert.equal(await worker.request('https://example.com/other-page'), undefined);
    assert.equal(await worker.request('https://example.com/archery-timer/missing.html'), undefined);
    assert.equal(await worker.request('https://example.com/archery-timer/', 'navigate', 'POST'), undefined);
});

test('an installed update is announced even before registration.waiting is populated', async () => {
    const status = { textContent: 'Preparing offline access...' };
    const registrationListeners = new Map();
    const workerListeners = new Map();
    const worker = {
        state: 'installing',
        addEventListener: (type, callback) => workerListeners.set(type, callback)
    };
    const registration = {
        active: {},
        waiting: null,
        installing: null,
        addEventListener: (type, callback) => registrationListeners.set(type, callback)
    };
    const context = vm.createContext({
        document: { getElementById: () => status },
        window: { isSecureContext: true },
        navigator: { serviceWorker: {
            register: async () => registration,
            ready: Promise.resolve(registration)
        } },
        console
    });
    const offlineSource = readFileSync(`${__dirname}/offline.js`, 'utf8');
    await vm.runInContext(offlineSource, context);
    assert.equal(status.textContent, 'Ready for offline use.');
    registration.installing = worker;
    registrationListeners.get('updatefound')();
    worker.state = 'installed';
    workerListeners.get('statechange')();
    assert.match(status.textContent, /Update available/);
    worker.state = 'redundant';
    const errors = [];
    context.console = { error: message => errors.push(message) };
    workerListeners.get('statechange')();
    assert.match(status.textContent, /failed/);
    assert.equal(errors.length, 1);
});

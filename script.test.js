const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/script.js`, 'utf8');
const html = readFileSync(`${__dirname}/index.html`, 'utf8');

function createWakeLock() {
    return {
        released: false,
        listeners: new Map(),
        async release() {
            this.released = true;
            this.listeners.get('release')?.();
        },
        addEventListener(type, callback) { this.listeners.set(type, callback); }
    };
}

function createApp(search = '', audioOptions = {}, wakeLockOptions = {}) {
    const elements = new Map();
    const audioStats = { playCalls: 0, pauseCalls: 0, resumeCalls: 0, errors: [] };
    const wakeLockStats = { requests: [], locks: [] };
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
        const classes = new Set();
        const listeners = new Map();
        const label = { textContent: '' };
        elements.set(id, {
            value: '',
            checked: false,
            disabled: false,
            innerHTML: '',
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name)
            },
            listeners,
            paused: true,
            currentTime: 0,
            play() {
                audioStats.playCalls++;
                if (audioOptions.playError) return Promise.reject(audioOptions.playError);
                this.paused = false;
                return Promise.resolve();
            },
            pause() {
                audioStats.pauseCalls++;
                const wasPlaying = !this.paused;
                this.paused = true;
                if (wasPlaying) this.listeners.get('pause')?.();
            },
            addEventListener: (type, callback) => listeners.set(type, callback),
            click() {
                if (!this.disabled) listeners.get('click')?.();
            },
            querySelector: selector => selector === '.btn-label' ? label : null
        });
    }
    const context = vm.createContext({
        document: {
            body: { setAttribute() {}, classList: { add() {}, remove() {} } },
            getElementById: id => elements.get(id),
            hidden: false,
            listeners: new Map(),
            addEventListener(type, callback) { this.listeners.set(type, callback); }
        },
        window: {
            location: { search, pathname: '/' },
            history: { replaceState: (_state, _title, url) => { context.savedURL = url; } },
            isSecureContext: true,
            listeners: new Map(),
            addEventListener(type, callback) { this.listeners.set(type, callback); },
            AudioContext: class {
                state = audioOptions.contextState || 'running';
                resume() {
                    audioStats.resumeCalls++;
                    if (audioOptions.resumeError) return Promise.reject(audioOptions.resumeError);
                    this.state = 'running';
                    return Promise.resolve();
                }
            }
        },
        navigator: wakeLockOptions.supported === false ? {} : {
            wakeLock: {
                request(type) {
                    wakeLockStats.requests.push(type);
                    if (wakeLockOptions.request) return wakeLockOptions.request(type);
                    if (wakeLockOptions.error) return Promise.reject(wakeLockOptions.error);
                    const lock = createWakeLock();
                    wakeLockStats.locks.push(lock);
                    return Promise.resolve(lock);
                }
            }
        },
        URLSearchParams,
        Date,
        performance: { now: () => 0 },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {},
        console: { log() {}, error: (...args) => audioStats.errors.push(args) }
    });
    vm.runInContext(`${source}
        globalThis.app = {
            state, startRound, nextSegment, finishNow, restartEnd, resetRound,
            handleConfigChange, handleKeydown, togglePause, handleTimerExpired,
            restoreAudio,
            getAudioContext: () => audioCtx
        };
    `, context);
    // Exercise the real state machine without generating audio.
    Object.assign(context.app.state.config, { beepPrep: false, beepShoot: false, beepEnd: false });
    return { ...context.app, elements, context, audioStats, wakeLockStats };
}

function completeSegment(app) {
    app.finishNow();
    app.nextSegment();
}

test('disabling alternation keeps AB first every end', () => {
    const app = createApp('?alternateLines=false&ends=2&practiceEnds=0');
    assert.equal(app.elements.get('alternate-lines-check').checked, false);
    app.startRound();
    const lines = [];
    while (app.state.status !== 'finished') {
        lines.push([app.state.currentEnd, app.state.currentLine]);
        completeSegment(app);
    }
    assert.deepEqual(lines, [[1, 1], [1, 2], [2, 1], [2, 2]]);
});

test('alternates across practice and scoring ends and finishes after both lines', () => {
    const app = createApp('?alternateLines=true&practiceEnds=1&ends=2&timePrep=0');
    app.startRound();
    const lines = [];
    while (app.state.status !== 'finished') {
        assert.equal(app.state.status, 'shoot');
        lines.push([app.state.currentEnd, app.state.currentLine]);
        completeSegment(app);
    }
    assert.deepEqual(lines, [[1, 1], [1, 2], [2, 2], [2, 1], [3, 1], [3, 2]]);
});

test('between-end labels recognize CD-first ends correctly', () => {
    const app = createApp('?alternateLines=true&practiceEnds=0&ends=2');
    app.startRound();
    completeSegment(app);
    completeSegment(app);
    assert.equal(app.state.currentLine, 2);
    assert.match(app.elements.get('big-line').innerHTML, />CD</);
    app.finishNow();
    assert.equal(app.elements.get('big-end').innerHTML, 'Next:<span class="end-number-large">AB 2/2</span>');
    assert.match(app.elements.get('big-line').innerHTML, /^Line<br>.*>CD</);
    app.nextSegment();
    assert.equal(app.state.currentLine, 1);
    app.finishNow();
    assert.equal(app.elements.get('big-end').innerHTML, 'Next: Finish');
});

for (const alternateLines of [true, false]) {
    test(`shows only upcoming line/end with alternation ${alternateLines}`, () => {
        const app = createApp(`?alternateLines=${alternateLines}&practiceEnds=0&ends=2`);
        app.startRound();
        app.finishNow();
        assert.equal(app.elements.get('big-end').innerHTML, 'Next:<span class="end-number-large">CD 1/2</span>');
        assert.match(app.elements.get('big-line').innerHTML, /^Line<br>.*>AB</);
        app.nextSegment();
        assert.match(app.elements.get('big-line').innerHTML, /^Line<br>.*>CD</);
        app.finishNow();
        const nextLine = alternateLines ? 'CD' : 'AB';
        assert.equal(app.elements.get('big-end').innerHTML, `Next:<span class="end-number-large">${nextLine} 2/2</span>`);
        app.nextSegment();
        assert.match(app.elements.get('big-line').innerHTML, new RegExp(`^Line<br>.*>${nextLine}<`));
        assert.match(app.elements.get('big-end').innerHTML, /End<br>.*2\/2/);
    });
}

test('previews practice-to-scoring transition only after both lines finish', () => {
    const app = createApp('?practiceEnds=1&ends=2');
    app.startRound();
    app.finishNow();
    assert.equal(app.elements.get('big-end').innerHTML, 'Next: Practice<span class="end-number-large">CD 1/1</span>');
    app.nextSegment();
    app.finishNow();
    assert.equal(app.elements.get('big-end').innerHTML, 'Next:<span class="end-number-large">CD 1/2</span>');
});

test('restart returns to the first line of the same end and reset starts with AB', () => {
    const app = createApp('?alternateLines=true&practiceEnds=0&ends=2');
    app.startRound();
    completeSegment(app);
    completeSegment(app);
    completeSegment(app);
    assert.equal(app.state.currentLine, 1);
    app.restartEnd();
    assert.equal(app.state.currentEnd, 2);
    assert.equal(app.state.currentLine, 2);
    assert.equal(app.state.paused, true);
    assert.equal(app.elements.get('next-btn').disabled, false);
    app.resetRound();
    app.startRound();
    assert.equal(app.state.currentEnd, 1);
    assert.equal(app.state.currentLine, 1);
});

test('single-line mode ignores alternation and disables its checkbox', () => {
    const app = createApp('?lines=1&alternateLines=true&practiceEnds=0&ends=2');
    assert.equal(app.elements.get('alternate-lines-check').disabled, true);
    app.startRound();
    completeSegment(app);
    assert.equal(app.state.currentEnd, 2);
    assert.equal(app.state.currentLine, 1);
    completeSegment(app);
    assert.equal(app.state.status, 'finished');
});

test('checkbox changes persist in the URL and survive preset changes', () => {
    const app = createApp();
    const checkbox = app.elements.get('alternate-lines-check');
    assert.equal(checkbox.checked, true);
    checkbox.checked = true;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.state.config.alternateLines, true);
    const reloaded = createApp(new URL(app.context.savedURL, 'http://localhost').search);
    assert.equal(reloaded.elements.get('alternate-lines-check').checked, true);
    const preset = app.elements.get('preset-select');
    preset.value = 'usaOutdoor';
    app.handleConfigChange({ target: preset });
    preset.value = 'custom';
    app.handleConfigChange({ target: preset });
    assert.equal(checkbox.checked, true);
    const lines = app.elements.get('lines-select');
    lines.value = '1';
    app.handleConfigChange({ target: lines });
    assert.equal(checkbox.disabled, true);
    lines.value = '2';
    app.handleConfigChange({ target: lines });
    assert.equal(checkbox.disabled, false);
    assert.equal(checkbox.checked, true);
    checkbox.checked = false;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.state.config.alternateLines, false);
    assert.match(app.context.savedURL, /alternateLines=false/);
});

function pressSpace(app, options = {}) {
    let prevented = false;
    app.handleKeydown({
        code: 'Space',
        key: ' ',
        repeat: false,
        target: { tagName: 'BODY' },
        preventDefault() { prevented = true; },
        ...options
    });
    return prevented;
}

for (const timePrep of [0, 10]) {
    test(`Space finishes the active segment and a second press advances (prep ${timePrep})`, () => {
        const app = createApp(`?simplerKeyboardControls=true&practiceEnds=0&ends=1&timePrep=${timePrep}`);
        app.startRound();
        assert.equal(pressSpace(app), true);
        assert.equal(app.state.status, 'between');
        assert.equal(app.state.currentLine, 1);
        pressSpace(app, { repeat: true });
        assert.equal(app.state.status, 'between');
        assert.equal(app.state.currentLine, 1);
        pressSpace(app);
        assert.equal(app.state.status, timePrep ? 'prep' : 'shoot');
        assert.equal(app.state.currentLine, 2);
        pressSpace(app, { repeat: true });
        assert.equal(app.state.status, timePrep ? 'prep' : 'shoot');
        pressSpace(app);
        pressSpace(app);
        assert.equal(app.state.status, 'finished');
        pressSpace(app);
        assert.equal(app.state.status, 'finished');
    });
}

test('Space keeps advance behavior for paused/restarted segments', () => {
    const app = createApp();
    app.startRound();
    app.restartEnd();
    pressSpace(app);
    assert.equal(app.state.currentLine, 2);
    assert.equal(app.state.paused, false);
    assert.equal(app.state.status, 'prep');
});

test('Space ignores configuration inputs and does not start an idle round', () => {
    const app = createApp();
    pressSpace(app);
    assert.equal(app.state.status, 'idle');
    app.startRound();
    for (const tagName of ['INPUT', 'SELECT']) {
        assert.equal(pressSpace(app, { target: { tagName } }), false);
        assert.equal(app.state.status, 'prep');
    }
});

for (const timePrep of [0, 10]) {
    test(`one button finishes and advances with a state-dependent label (prep ${timePrep})`, () => {
        const app = createApp(`?simplerKeyboardControls=true&lines=1&practiceEnds=0&ends=1&timePrep=${timePrep}`);
        const button = app.elements.get('next-btn');
        const label = button.querySelector('.btn-label');
        assert.equal(app.elements.get('finish-now-btn').hidden, true);
        assert.equal(button.disabled, true);
        app.startRound();
        assert.equal(label.textContent, 'Finish Now');
        assert.equal(button.disabled, false);
        button.click();
        assert.equal(app.state.status, 'between');
        assert.equal(label.textContent, 'Next Line/End');
        button.click();
        assert.equal(app.state.status, 'finished');
        assert.equal(button.disabled, true);
    });
}

test('the primary button follows pause/resume, restart, and natural timer expiry', () => {
    const app = createApp('?simplerKeyboardControls=true&timePrep=0');
    const button = app.elements.get('next-btn');
    const label = button.querySelector('.btn-label');
    app.startRound();
    app.togglePause();
    assert.equal(label.textContent, 'Next Line/End');
    app.togglePause();
    assert.equal(label.textContent, 'Finish Now');
    app.restartEnd();
    assert.equal(label.textContent, 'Next Line/End');
    button.click();
    assert.equal(app.state.currentLine, 2);
    assert.equal(label.textContent, 'Finish Now');
    app.handleTimerExpired();
    assert.equal(label.textContent, 'Next Line/End');
    assert.equal(button.disabled, false);
});

test('default controls keep separate buttons and Space cannot finish a running segment', () => {
    const app = createApp('?timePrep=0');
    const finish = app.elements.get('finish-now-btn');
    const next = app.elements.get('next-btn');
    assert.equal(app.elements.get('simpler-keyboard-controls-check').checked, false);
    app.startRound();
    assert.equal(finish.hidden, false);
    assert.equal(next.disabled, true);
    assert.equal(next.querySelector('.btn-label').textContent, 'Next Line/End');
    pressSpace(app);
    assert.equal(app.state.status, 'shoot');
    finish.click();
    assert.equal(app.state.status, 'between');
    assert.equal(next.disabled, false);
    pressSpace(app);
    assert.equal(app.state.currentLine, 2);
    app.handleKeydown({ key: 'f', code: 'KeyF', target: { tagName: 'BODY' } });
    assert.equal(app.state.status, 'between');
});

test('simpler controls persist through URL reload and preset changes and can be turned off', () => {
    const app = createApp('?beepPrep=false&beepShoot=false&beepEnd=false');
    const checkbox = app.elements.get('simpler-keyboard-controls-check');
    checkbox.checked = true;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.state.config.simplerKeyboardControls, true);
    assert.equal(app.elements.get('finish-now-btn').hidden, true);
    const reloaded = createApp(new URL(app.context.savedURL, 'http://localhost').search);
    assert.equal(reloaded.elements.get('simpler-keyboard-controls-check').checked, true);
    assert.equal(reloaded.elements.get('finish-now-btn').hidden, true);
    const preset = app.elements.get('preset-select');
    preset.value = 'usaOutdoor';
    app.handleConfigChange({ target: preset });
    preset.value = 'custom';
    app.handleConfigChange({ target: preset });
    assert.equal(checkbox.checked, true);
    checkbox.checked = false;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.elements.get('finish-now-btn').hidden, false);
    assert.match(app.context.savedURL, /simplerKeyboardControls=false/);
    app.startRound();
    pressSpace(app);
    assert.equal(app.state.status, 'prep');
});

test('Apple audio optimization is opt-in and does not autoplay on page load', () => {
    const app = createApp();
    assert.equal(app.elements.get('optimize-apple-audio-check').checked, false);
    app.startRound();
    assert.equal(app.audioStats.playCalls, 0);
    const enabled = createApp('?optimizeAppleAudio=true');
    assert.equal(enabled.elements.get('optimize-apple-audio-check').checked, true);
    assert.equal(enabled.audioStats.playCalls, 0);
});

test('silent playback spans pauses and between-line waits and stops at round completion', () => {
    const app = createApp('?optimizeAppleAudio=true&practiceEnds=0&ends=1');
    const media = app.elements.get('audio-keepalive');
    app.startRound();
    assert.equal(app.audioStats.playCalls, 1);
    app.togglePause();
    assert.equal(media.paused, false);
    app.togglePause();
    completeSegment(app);
    assert.equal(app.audioStats.playCalls, 1);
    app.finishNow();
    assert.equal(media.paused, false);
    app.nextSegment();
    assert.equal(app.state.status, 'finished');
    assert.equal(media.paused, true);
    assert.equal(media.currentTime, 0);
});

test('Apple audio setting survives URL and preset changes, and disabling it stops playback', () => {
    const app = createApp('?beepPrep=false&beepShoot=false&beepEnd=false');
    const checkbox = app.elements.get('optimize-apple-audio-check');
    checkbox.checked = true;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.audioStats.playCalls, 0);
    const reload = createApp(new URL(app.context.savedURL, 'http://localhost').search);
    assert.equal(reload.elements.get('optimize-apple-audio-check').checked, true);
    const preset = app.elements.get('preset-select');
    preset.value = 'usaOutdoor';
    app.handleConfigChange({ target: preset });
    preset.value = 'custom';
    app.handleConfigChange({ target: preset });
    assert.equal(checkbox.checked, true);
    app.startRound();
    assert.equal(app.elements.get('audio-keepalive').paused, false);
    checkbox.checked = false;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.elements.get('audio-keepalive').paused, true);
    assert.match(app.context.savedURL, /optimizeAppleAudio=false/);
    assert.equal(app.state.config.beepPrep, false);
    assert.equal(app.state.config.beepShoot, false);
    assert.equal(app.state.config.beepEnd, false);
});

test('reset stops silence and a rejected pending play cannot show a stale warning', async () => {
    const options = { playError: new Error('Playback blocked') };
    const app = createApp('?optimizeAppleAudio=true', options);
    app.startRound();
    app.resetRound();
    await new Promise(setImmediate);
    assert.equal(app.elements.get('audio-keepalive').paused, true);
    assert.equal(app.elements.get('audio-warning').hidden, true);
    assert.equal(app.audioStats.errors.length, 0);
});

test('blocked silent playback shows a warning and can be retried without resetting the timer', async () => {
    const options = { playError: new Error('Playback blocked') };
    const app = createApp('?optimizeAppleAudio=true', options);
    app.startRound();
    await new Promise(setImmediate);
    assert.equal(app.elements.get('audio-warning').hidden, false);
    assert.match(app.elements.get('audio-warning-text').textContent, /Silent audio/);
    assert.equal(app.audioStats.errors.length, 1);
    delete options.playError;
    app.elements.get('retry-audio-btn').listeners.get('click')();
    await new Promise(setImmediate);
    assert.equal(app.elements.get('audio-keepalive').paused, false);
    assert.equal(app.elements.get('audio-warning').hidden, true);
    assert.equal(app.state.status, 'prep');
    assert.equal(app.state.currentEnd, 1);
});

test('returning to the foreground resumes interrupted Web Audio and silent playback', async () => {
    const app = createApp('?optimizeAppleAudio=true');
    app.startRound();
    const media = app.elements.get('audio-keepalive');
    app.context.document.hidden = true;
    media.pause();
    app.getAudioContext().state = 'interrupted';
    app.restoreAudio();
    assert.equal(app.audioStats.resumeCalls, 0);
    app.context.document.hidden = false;
    app.restoreAudio();
    await new Promise(setImmediate);
    assert.equal(app.audioStats.resumeCalls, 1);
    assert.equal(media.paused, false);
});

test('failure to resume an interrupted audio context stays visible even if silence plays', async () => {
    const options = { contextState: 'interrupted', resumeError: new Error('Resume blocked') };
    const app = createApp('?optimizeAppleAudio=true', options);
    app.startRound();
    await new Promise(setImmediate);
    assert.equal(app.elements.get('audio-keepalive').paused, false);
    assert.match(app.elements.get('audio-warning-text').textContent, /Timer audio could not resume/);
    assert.equal(app.elements.get('audio-warning').hidden, false);
    delete options.resumeError;
    app.elements.get('retry-audio-btn').listeners.get('click')();
    await new Promise(setImmediate);
    assert.equal(app.elements.get('audio-warning').hidden, true);
});

test('the keep-alive WAV contains only digital silence', () => {
    const wav = readFileSync(`${__dirname}/audio/silence.wav`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1); // PCM
    assert.equal(wav.readUInt16LE(34), 16);
    assert.ok(wav.length > 44);
    assert.ok(wav.subarray(44).every(sample => sample === 0));
});

test('screen wake lock is off by default and does not start until an enabled round starts', async () => {
    const app = createApp();
    assert.equal(app.elements.get('keep-screen-awake-check').checked, false);
    app.startRound();
    assert.deepEqual(app.wakeLockStats.requests, []);
    const enabled = createApp('?keepScreenAwake=true&lines=1&practiceEnds=0&ends=1');
    assert.equal(enabled.elements.get('keep-screen-awake-check').checked, true);
    assert.deepEqual(enabled.wakeLockStats.requests, []);
    enabled.startRound();
    await new Promise(setImmediate);
    assert.deepEqual(enabled.wakeLockStats.requests, ['screen']);
    assert.equal(enabled.elements.get('wake-lock-status-text').textContent, 'Screen kept awake.');
    enabled.togglePause();
    enabled.finishNow();
    assert.equal(enabled.wakeLockStats.locks[0].released, false);
    assert.equal(enabled.wakeLockStats.requests.length, 1);
    enabled.nextSegment();
    await new Promise(setImmediate);
    assert.equal(enabled.wakeLockStats.locks[0].released, true);
    assert.equal(enabled.elements.get('wake-lock-status').hidden, true);
});

test('wake lock is released when hidden and reacquired when the round becomes visible', async () => {
    const app = createApp('?keepScreenAwake=true');
    app.startRound();
    await new Promise(setImmediate);
    app.context.document.hidden = true;
    app.context.document.listeners.get('visibilitychange')();
    await new Promise(setImmediate);
    assert.equal(app.wakeLockStats.locks[0].released, true);
    assert.equal(app.wakeLockStats.requests.length, 1);
    app.context.document.hidden = false;
    app.context.document.listeners.get('visibilitychange')();
    await new Promise(setImmediate);
    assert.equal(app.wakeLockStats.requests.length, 2);
    assert.equal(app.wakeLockStats.locks[1].released, false);
    app.context.window.listeners.get('pagehide')();
    assert.equal(app.wakeLockStats.locks[1].released, true);
    app.context.window.listeners.get('pageshow')();
    await new Promise(setImmediate);
    assert.equal(app.wakeLockStats.requests.length, 3);
});

test('wake lock preference persists through URL/preset changes and releases on disable or reset', async () => {
    const app = createApp('?beepPrep=false&beepShoot=false&beepEnd=false');
    const checkbox = app.elements.get('keep-screen-awake-check');
    checkbox.checked = true;
    app.handleConfigChange({ target: checkbox });
    const reloaded = createApp(new URL(app.context.savedURL, 'http://localhost').search);
    assert.equal(reloaded.elements.get('keep-screen-awake-check').checked, true);
    const preset = app.elements.get('preset-select');
    preset.value = 'usaOutdoor';
    app.handleConfigChange({ target: preset });
    preset.value = 'custom';
    app.handleConfigChange({ target: preset });
    assert.equal(checkbox.checked, true);
    app.startRound();
    await new Promise(setImmediate);
    checkbox.checked = false;
    app.handleConfigChange({ target: checkbox });
    assert.equal(app.wakeLockStats.locks[0].released, true);
    assert.match(app.context.savedURL, /keepScreenAwake=false/);
    checkbox.checked = true;
    app.handleConfigChange({ target: checkbox });
    await new Promise(setImmediate);
    app.resetRound();
    assert.equal(app.wakeLockStats.locks[1].released, true);
    assert.equal(app.elements.get('wake-lock-status').hidden, true);
});

test('unsupported and denied wake locks show honest status, and denied requests can be retried', async () => {
    const unsupported = createApp('?keepScreenAwake=true', {}, { supported: false });
    unsupported.startRound();
    assert.match(unsupported.elements.get('wake-lock-status-text').textContent, /unavailable/);
    assert.equal(unsupported.elements.get('wake-lock-status').hidden, false);
    const options = { error: new Error('Low battery') };
    const app = createApp('?keepScreenAwake=true', {}, options);
    app.startRound();
    await new Promise(setImmediate);
    assert.match(app.elements.get('wake-lock-status-text').textContent, /Could not keep/);
    assert.equal(app.elements.get('retry-wake-lock-btn').hidden, false);
    assert.equal(app.audioStats.errors.length, 1);
    delete options.error;
    app.elements.get('retry-wake-lock-btn').listeners.get('click')();
    await new Promise(setImmediate);
    assert.equal(app.elements.get('wake-lock-status-text').textContent, 'Screen kept awake.');
    assert.equal(app.elements.get('retry-wake-lock-btn').hidden, true);
    assert.equal(app.state.currentEnd, 1);
});

test('system release is visible and does not cause an automatic retry loop', async () => {
    const app = createApp('?keepScreenAwake=true');
    app.startRound();
    await new Promise(setImmediate);
    await app.wakeLockStats.locks[0].release();
    assert.match(app.elements.get('wake-lock-status-text').textContent, /was released/);
    assert.equal(app.elements.get('retry-wake-lock-btn').hidden, false);
    assert.equal(app.wakeLockStats.requests.length, 1);
});

test('a lock revoked before its request resolves is not reported as active', async () => {
    const lock = createWakeLock();
    lock.released = true;
    const app = createApp('?keepScreenAwake=true', {}, { request: () => Promise.resolve(lock) });
    app.startRound();
    await new Promise(setImmediate);
    assert.match(app.elements.get('wake-lock-status-text').textContent, /was released/);
    assert.equal(app.elements.get('retry-wake-lock-btn').hidden, false);
});

test('a late wake lock grant is immediately released after a round resets', async () => {
    let grant;
    const pending = new Promise(resolve => { grant = resolve; });
    const app = createApp('?keepScreenAwake=true', {}, { request: () => pending });
    app.startRound();
    app.resetRound();
    const lock = createWakeLock();
    grant(lock);
    await new Promise(setImmediate);
    assert.equal(lock.released, true);
    assert.equal(app.elements.get('wake-lock-status').hidden, true);
});

test('restarting a round while an old wake lock request is pending acquires a fresh lock', async () => {
    let grant;
    const pending = new Promise(resolve => { grant = resolve; });
    const oldLock = createWakeLock();
    const newLock = createWakeLock();
    let requests = 0;
    const app = createApp('?keepScreenAwake=true', {}, {
        request: () => ++requests === 1 ? pending : Promise.resolve(newLock)
    });
    app.startRound();
    app.resetRound();
    app.startRound();
    assert.equal(requests, 1);
    grant(oldLock);
    await new Promise(setImmediate);
    assert.equal(oldLock.released, true);
    assert.equal(newLock.released, false);
    assert.equal(requests, 2);
    assert.equal(app.elements.get('wake-lock-status-text').textContent, 'Screen kept awake.');
});

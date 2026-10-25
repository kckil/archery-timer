const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/script.js`, 'utf8');
const html = readFileSync(`${__dirname}/index.html`, 'utf8');

function createApp(search = '') {
    const elements = new Map();
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
            addEventListener() {}
        },
        window: {
            location: { search, pathname: '/' },
            history: { replaceState: (_state, _title, url) => { context.savedURL = url; } },
            AudioContext: class {}
        },
        URLSearchParams,
        Date,
        performance: { now: () => 0 },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {},
        console: { log() {} }
    });
    vm.runInContext(`${source}
        globalThis.app = {
            state, startRound, nextSegment, finishNow, restartEnd, resetRound,
            handleConfigChange, handleKeydown, togglePause, handleTimerExpired
        };
    `, context);
    // Exercise the real state machine without generating audio.
    Object.assign(context.app.state.config, { beepPrep: false, beepShoot: false, beepEnd: false });
    return { ...context.app, elements, context };
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

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
        elements.set(id, {
            value: '',
            checked: false,
            disabled: false,
            innerHTML: '',
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name)
            },
            addEventListener() {},
            querySelector: () => null
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
            handleConfigChange
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
    assert.doesNotMatch(app.elements.get('big-end').innerHTML, /Last:/);
    app.nextSegment();
    assert.equal(app.state.currentLine, 1);
    app.finishNow();
    assert.match(app.elements.get('big-end').innerHTML, /Next: Finish/);
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

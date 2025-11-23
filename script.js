/**
 * Archery Timer Logic
 */

// --- Constants & Config Defaults ---
const DEFAULTS = {
    preset: 'usa18m',
    lines: 2,
    ends: 20,
    practiceEnds: 2,
    timePrep: 10,
    timeShoot: 120,
    warningThreshold: 30,
    beepPrep: true,
    beepShoot: true,
    beepEnd: true,
    theme: 'dark'
};

const PRESETS = {
    usa18m: { timePrep: 10, timeShoot: 120, warningThreshold: 30, ends: 10, practiceEnds: 2 },
    usaOutdoor: { timePrep: 10, timeShoot: 240, warningThreshold: 30, ends: 12, practiceEnds: 2 },
    custom: {}
};

// --- State Machine Constants ---
const STATE = {
    IDLE: 'idle',
    PREP: 'prep',
    SHOOT: 'shoot',
    BETWEEN: 'between',
    FINISHED: 'finished'
};

// --- Global State ---
let state = {
    status: STATE.IDLE,
    config: { ...DEFAULTS },
    customConfig: { ...DEFAULTS }, // Store custom values here
    currentEnd: 0, // 0 = not started
    currentLine: 1, // 1 = A, 2 = B
    paused: false,
    remainingMs: 0,
    lastTick: 0,
    timerId: null,
    // Stats
    roundStartTime: null,
    currentEndStartTime: null,
    completedEndDurations: []
};

// --- Audio Context ---
let audioCtx = null;

// --- DOM Elements ---
const els = {};

function init() {
    // Cache DOM elements
    els.app = document.body;
    els.panel = document.getElementById('config-panel');
    els.timerDisplay = document.getElementById('timer-display');
    els.timerDigits = document.getElementById('timer-digits');

    els.bigLine = document.getElementById('big-line');
    els.bigLine = document.getElementById('big-line');
    els.bigEnd = document.getElementById('big-end');

    // Stats Elements
    els.stats = {
        container: document.getElementById('stats-display'),
        lastEnd: document.getElementById('stat-last-end'),
        avgEnd: document.getElementById('stat-avg-end'),
        total: document.getElementById('stat-total-duration'),
        estFinish: document.getElementById('stat-est-finish'),
        startedAt: document.getElementById('stat-started-at')
    };

    // Status bar elements removed

    els.runningControls = document.getElementById('running-controls');

    // Inputs
    els.inputs = {
        preset: document.getElementById('preset-select'),
        lines: document.getElementById('lines-select'),
        ends: document.getElementById('ends-input'),
        practiceEnds: document.getElementById('practice-ends-input'),
        timePrep: document.getElementById('time-prep-input'),
        timeShoot: document.getElementById('time-shoot-input'),
        warningThreshold: document.getElementById('warning-threshold-input'),
        beepPrep: document.getElementById('beep-prep-check'),
        beepShoot: document.getElementById('beep-shoot-check'),
        beepEnd: document.getElementById('beep-end-check'),
        beepShoot: document.getElementById('beep-shoot-check'),
        beepEnd: document.getElementById('beep-end-check'),
        theme: document.getElementById('theme-select')
    };

    // Buttons
    els.btns = {
        startPanel: document.getElementById('start-btn-panel'),
        pause: document.getElementById('pause-btn'),
        finishNow: document.getElementById('finish-now-btn'),
        next: document.getElementById('next-btn'),
        reset: document.getElementById('reset-btn') // If we add one
    };

    // Bind Events
    bindEvents();

    // Load Config from URL
    loadConfigFromURL();

    // Initial Render
    render();
}

function bindEvents() {
    // Config Changes
    Object.values(els.inputs).forEach(input => {
        input.addEventListener('change', handleConfigChange);
        input.addEventListener('input', handleConfigChange); // For immediate feedback
    });

    // Buttons
    els.btns.startPanel.addEventListener('click', () => startRound());
    els.btns.pause.addEventListener('click', () => togglePause());
    els.btns.finishNow.addEventListener('click', () => finishNow());
    els.btns.next.addEventListener('click', () => nextSegment());
    els.btns.restartEnd = document.getElementById('restart-end-btn');
    els.btns.restartEnd.addEventListener('click', () => restartEnd());
    els.btns.reset = document.getElementById('reset-btn');
    els.btns.reset.addEventListener('click', () => confirmReset());

    // Modal
    els.modal = {
        overlay: document.getElementById('modal-overlay'),
        confirmBtn: document.getElementById('modal-confirm'),
        cancelBtn: document.getElementById('modal-cancel')
    };

    els.modal.confirmBtn.addEventListener('click', () => {
        resetRound();
        hideModal();
    });

    els.modal.cancelBtn.addEventListener('click', () => hideModal());

    // Keyboard Shortcuts
    document.addEventListener('keydown', handleKeydown);
}

function handleConfigChange(e) {
    // Read values from inputs and update state.config
    const c = state.config;
    const i = els.inputs;

    // If user manually changed ANY config input (except preset/theme), switch preset to custom
    // We need to detect if the change came from a user interaction with a specific input
    if (e && e.target !== i.preset && e.target !== i.theme) {
        i.preset.value = 'custom';
    }

    // Handle Preset Logic
    if (i.preset.value !== 'custom' && PRESETS[i.preset.value]) {
        // Switching TO a preset
        const p = PRESETS[i.preset.value];
        // Only update fields defined in the preset
        if (p.timePrep !== undefined) i.timePrep.value = p.timePrep;
        if (p.timeShoot !== undefined) i.timeShoot.value = p.timeShoot;
        if (p.warningThreshold !== undefined) i.warningThreshold.value = p.warningThreshold;
        if (p.ends !== undefined) i.ends.value = p.ends;
        if (p.practiceEnds !== undefined) i.practiceEnds.value = p.practiceEnds;

        // Save current custom config before overwriting? 
        // No, we save custom config when we are IN custom mode.
    } else if (i.preset.value === 'custom' && e && e.target === i.preset) {
        // Switching TO custom (from a preset)
        // Restore saved custom values
        const cc = state.customConfig;
        i.timePrep.value = cc.timePrep;
        i.timeShoot.value = cc.timeShoot;
        i.warningThreshold.value = cc.warningThreshold;
        i.ends.value = cc.ends;
        i.practiceEnds.value = cc.practiceEnds;
        i.lines.value = cc.lines;
        i.beepPrep.checked = cc.beepPrep;
        i.beepShoot.checked = cc.beepShoot;
        i.beepEnd.checked = cc.beepEnd;
    }

    // Update Config State
    c.preset = i.preset.value;
    c.lines = parseInt(i.lines.value);
    c.ends = parseInt(i.ends.value);
    c.practiceEnds = parseInt(i.practiceEnds.value);
    c.timePrep = parseInt(i.timePrep.value);
    c.timeShoot = parseInt(i.timeShoot.value);
    c.warningThreshold = parseInt(i.warningThreshold.value);
    c.beepPrep = i.beepPrep.checked;
    c.beepShoot = i.beepShoot.checked;
    c.beepEnd = i.beepEnd.checked;
    c.beepShoot = i.beepShoot.checked;
    c.beepEnd = i.beepEnd.checked;
    c.theme = i.theme.value;

    // If we are in custom mode, update customConfig
    if (c.preset === 'custom') {
        state.customConfig = { ...c };
    }

    updateURL();
    renderTheme();
}

function loadConfigFromURL() {
    const params = new URLSearchParams(window.location.search);
    const c = state.config;

    if (params.has('preset')) c.preset = params.get('preset');
    if (params.has('lines')) c.lines = parseInt(params.get('lines'));
    if (params.has('ends')) c.ends = parseInt(params.get('ends'));
    if (params.has('practiceEnds')) c.practiceEnds = parseInt(params.get('practiceEnds'));
    if (params.has('timePrep')) c.timePrep = parseInt(params.get('timePrep'));
    if (params.has('timeShoot')) c.timeShoot = parseInt(params.get('timeShoot'));
    if (params.has('warningThreshold')) c.warningThreshold = parseInt(params.get('warningThreshold'));
    if (params.has('beepPrep')) c.beepPrep = params.get('beepPrep') === 'true';
    if (params.has('beepShoot')) c.beepShoot = params.get('beepShoot') === 'true';
    if (params.has('beepEnd')) c.beepEnd = params.get('beepEnd') === 'true';
    if (params.has('theme')) c.theme = params.get('theme');

    // Sync UI
    const i = els.inputs;
    i.preset.value = c.preset;
    i.lines.value = c.lines;
    i.ends.value = c.ends;
    i.practiceEnds.value = c.practiceEnds;
    i.timePrep.value = c.timePrep;
    i.timeShoot.value = c.timeShoot;
    i.warningThreshold.value = c.warningThreshold;
    i.beepPrep.checked = c.beepPrep;
    i.beepShoot.checked = c.beepShoot;
    i.beepEnd.checked = c.beepEnd;
    i.beepShoot.checked = c.beepShoot;
    i.beepEnd.checked = c.beepEnd;
    i.theme.value = c.theme;

    renderTheme();
}

function updateURL() {
    const params = new URLSearchParams();
    const c = state.config;
    for (const key in c) {
        params.set(key, c[key]);
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function renderTheme() {
    document.body.className = `theme-${state.config.theme}`;
    document.body.setAttribute('data-state', state.status);
}

// --- Core Logic Placeholders ---
function startRound() {
    console.log('Start Round');
    // Initialize Audio
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Initialize Audio
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    state.status = STATE.PREP; // Or check logic
    state.currentEnd = 1;
    state.currentLine = 1;

    // Stats Init
    state.roundStartTime = new Date();
    state.currentEndStartTime = new Date();
    state.completedEndDurations = [];

    // Logic to determine if Prep or Shoot
    if (state.config.timePrep > 0) {
        enterState(STATE.PREP);
    } else {
        enterState(STATE.SHOOT);
    }
}

function enterState(newState) {
    state.status = newState;
    state.paused = false;

    if (newState === STATE.PREP) {
        state.remainingMs = state.config.timePrep * 1000;
        playSound('prep');
    } else if (newState === STATE.SHOOT) {
        state.remainingMs = state.config.timeShoot * 1000;
        playSound('shoot');
    } else if (newState === STATE.BETWEEN) {
        state.remainingMs = 0;
    }

    render();

    if (newState === STATE.PREP || newState === STATE.SHOOT) {
        startTimer();
    } else {
        stopTimer();
    }
}

function startTimer() {
    stopTimer();
    state.lastTick = performance.now();
    state.timerId = requestAnimationFrame(tick);
}

function stopTimer() {
    if (state.timerId) cancelAnimationFrame(state.timerId);
    state.timerId = null;
}

function tick(now) {
    if (!state.paused) {
        const delta = now - state.lastTick;
        state.remainingMs -= delta;

        if (state.remainingMs <= 0) {
            state.remainingMs = 0;
            handleTimerExpired();
            return;
        }
    }
    state.lastTick = now;
    renderTimer();
    state.timerId = requestAnimationFrame(tick);
}

function handleTimerExpired() {
    if (state.status === STATE.PREP) {
        enterState(STATE.SHOOT);
    } else if (state.status === STATE.SHOOT) {
        playSound('end');
        enterState(STATE.BETWEEN);
    }
}

function finishNow() {
    if (state.status === STATE.PREP || state.status === STATE.SHOOT) {
        playSound('end');
        enterState(STATE.BETWEEN);
    }
}

function togglePause() {
    state.paused = !state.paused;
    if (!state.paused) {
        state.lastTick = performance.now();
    }
    render();
}

function nextSegment() {
    // Stats: Calculate duration of the segment just finished (Prep+Shoot+Wait)
    if (state.currentEndStartTime) {
        const now = new Date();
        const duration = now - state.currentEndStartTime;
        state.completedEndDurations.push(duration);
        state.currentEndStartTime = now; // Start time for NEXT segment
    }

    // Logic for next line/end
    const c = state.config;
    const totalEnds = c.practiceEnds + c.ends;

    if (c.lines === 2) {
        if (state.currentLine === 1) {
            state.currentLine = 2;
            // Go to Prep or Shoot
            c.timePrep > 0 ? enterState(STATE.PREP) : enterState(STATE.SHOOT);
        } else {
            // Line 2 done
            if (state.currentEnd < totalEnds) {
                state.currentEnd++;
                state.currentLine = 1;
                c.timePrep > 0 ? enterState(STATE.PREP) : enterState(STATE.SHOOT);
            } else {
                enterState(STATE.FINISHED);
            }
        }
    } else {
        // Single Line
        if (state.currentEnd < totalEnds) {
            state.currentEnd++;
            c.timePrep > 0 ? enterState(STATE.PREP) : enterState(STATE.SHOOT);
        } else {
            enterState(STATE.FINISHED);
        }
    }
}

function confirmReset() {
    els.modal.overlay.classList.remove('hidden');
}

function hideModal() {
    els.modal.overlay.classList.add('hidden');
}

function resetRound() {
    stopTimer();
    state.status = STATE.IDLE;
    state.paused = false;
    state.currentEnd = 0;
    state.currentLine = 1;
    state.roundStartTime = null;
    state.currentEndStartTime = null;
    state.completedEndDurations = [];
    render();
}

function restartEnd() {
    // Restart the current end from the beginning (Line A/AB)
    // Spec: "Restart end... go back to the paused state at the beginning of the current end"
    stopTimer();
    state.currentLine = 1;

    // Determine start state based on config
    if (state.config.timePrep > 0) {
        enterState(STATE.PREP);
    } else {
        enterState(STATE.SHOOT);
    }

    // Pause immediately
    state.paused = true;

    // Stats: Reset start time for this segment since we are restarting it
    state.currentEndStartTime = new Date();

    render();
}

function playSound(type) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const c = state.config;

    // Check if sound is enabled
    if (type === 'prep' && !c.beepPrep) return;
    if (type === 'shoot' && !c.beepShoot) return;
    if (type === 'end' && !c.beepEnd) return;

    if (type === 'prep') {
        playBuzzerSignal(2);
    } else if (type === 'shoot') {
        playBuzzerSignal(1);
    } else if (type === 'end') {
        playBuzzerSignal(3);
    }
}

// Removed playShootSignal as it is replaced by unified buzzer

function playBuzzerSignal(repeatCount) {
    let buzzIndex = 0;
    const duration = 0.7; // seconds
    const gap = 0.25; // seconds

    const playSingleBuzz = () => {
        const oscillator1 = audioCtx.createOscillator();
        const oscillator2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator1.type = 'sawtooth';
        oscillator1.frequency.setValueAtTime(450, audioCtx.currentTime);

        oscillator2.type = 'sawtooth';
        oscillator2.frequency.setValueAtTime(910, audioCtx.currentTime);

        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);

        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator1.start();
        oscillator2.start();

        oscillator1.stop(audioCtx.currentTime + duration);
        oscillator2.stop(audioCtx.currentTime + duration);

        buzzIndex++;
        if (buzzIndex < repeatCount) {
            setTimeout(playSingleBuzz, (duration + gap) * 1000);
        }
    };

    playSingleBuzz();
}

function render() {
    renderTheme();

    // Visibility
    const isRunning = [STATE.PREP, STATE.SHOOT, STATE.BETWEEN].includes(state.status);
    if (isRunning) {
        els.panel.classList.add('hidden');
        els.runningControls.classList.remove('hidden');
    } else {
        els.panel.classList.remove('hidden');
        els.runningControls.classList.add('hidden');
    }

    // Text Updates
    const isPractice = state.currentEnd <= state.config.practiceEnds;
    const endNum = isPractice ? state.currentEnd : (state.currentEnd - state.config.practiceEnds);
    const total = isPractice ? state.config.practiceEnds : state.config.ends;

    let endLabel = "";
    if (state.status === STATE.IDLE) {
        endLabel = "Ready";
    } else if (state.status === STATE.FINISHED) {
        endLabel = "Finished";
    } else if (state.status === STATE.BETWEEN) {
        // Check if we are between ENDS (Line 2 done or Single Line done)
        const isEndOfEnd = (state.config.lines === 1) || (state.config.lines === 2 && state.currentLine === 2);

        if (isEndOfEnd) {
            const nextEndNum = endNum + 1;
            // Handle transition from Practice to Scoring
            let nextLabel = "";
            if (state.currentEnd < state.config.practiceEnds + state.config.ends) {
                const isNextPractice = (state.currentEnd + 1) <= state.config.practiceEnds;
                const nextIndex = isNextPractice ? (state.currentEnd + 1) : (state.currentEnd + 1 - state.config.practiceEnds);
                const nextTotal = isNextPractice ? state.config.practiceEnds : state.config.ends;
                // User request: Remove "End" from "Next: End X/Y". Keep "Practice" if practice.
                const nextType = isNextPractice ? "Practice " : "";
                nextLabel = `Next: ${nextType}${nextIndex}/${nextTotal}`;
            } else {
                nextLabel = "Next: Finish";
            }

            // Line break for large display
            endLabel = `Last: ${endNum}/${total}<br>${nextLabel}`;
        } else {
            // Between lines (AB -> CD)
            endLabel = `${isPractice ? 'Practice' : 'End'} ${endNum} / ${total}`;
        }
    } else {
        endLabel = `${isPractice ? 'Practice' : 'End'} ${endNum} / ${total}`;
    }

    els.bigEnd.innerHTML = endLabel;
    // els.statusEnd.textContent = endLabel; // Removed

    let lineLabel = "Single Line";
    if (state.config.lines === 2) {
        // User request: "Line" text same formatting, "AB" or "CD" on next line and 50% larger.
        const lineName = state.currentLine === 1 ? "AB" : "CD";
        lineLabel = `Line<br><span class="line-name-large">${lineName}</span>`;
    }
    els.bigLine.innerHTML = lineLabel;
    // els.statusLine.textContent = lineLabel; // Removed

    // els.statusState.textContent = state.status.toUpperCase(); // Removed

    // Buttons
    // Enable Next Line/End if Between OR if we just restarted (Paused in Prep/Shoot)
    // User request: "Make sure after the restart that 'Next Line/End' is enabled."
    // We can detect "just restarted" if we are Paused and at start time?
    // Or just enable it always if we want to allow skipping?
    // Let's enable it if Between OR (Paused AND (Prep or Shoot))?
    // Actually, user specifically asked for it after restart.
    // Let's just enable it if we are not in IDLE/FINISHED?
    // No, standard behavior is disabled during running.
    // But "Restart Current End" puts us in Paused state.
    // Let's enable if status is BETWEEN or (status is PREP/SHOOT and paused).
    els.btns.next.disabled = !(state.status === STATE.BETWEEN || (state.paused && (state.status === STATE.PREP || state.status === STATE.SHOOT)));

    // Pause/Resume active only when timer is active (Prep/Shoot)
    const isTimerActive = state.status === STATE.PREP || state.status === STATE.SHOOT;
    els.btns.pause.disabled = !isTimerActive;
    const pauseLabel = els.btns.pause.querySelector('.btn-label');
    if (pauseLabel) pauseLabel.textContent = state.paused ? "Resume" : "Pause";

    renderTimer();
    renderStats();
}

function renderStats() {
    if (state.status !== STATE.BETWEEN) {
        els.stats.container.classList.add('hidden');
        return;
    }

    els.stats.container.classList.remove('hidden');

    // 1. Started At
    if (state.roundStartTime) {
        els.stats.startedAt.textContent = `Started at: ${formatTimeOfDay(state.roundStartTime)}`;
    }

    // 2. Total Duration
    if (state.roundStartTime) {
        const now = new Date();
        const diff = now - state.roundStartTime;
        els.stats.total.textContent = `Total: ${formatDuration(diff)}`;
    }

    // 3. Last End
    if (state.completedEndDurations.length > 0) {
        const last = state.completedEndDurations[state.completedEndDurations.length - 1];
        els.stats.lastEnd.textContent = `Last End: ${formatDuration(last)}`;
    } else {
        els.stats.lastEnd.textContent = `Last End: --:--`;
    }

    // 4. Avg End & Est Finish
    if (state.completedEndDurations.length > 0) {
        const totalDur = state.completedEndDurations.reduce((a, b) => a + b, 0);
        const avg = totalDur / state.completedEndDurations.length;
        els.stats.avgEnd.textContent = `Avg End: ${formatDuration(avg)}`;

        // Est Finish
        const totalEnds = state.config.practiceEnds + state.config.ends;
        // Total segments = totalEnds * lines
        const totalSegments = totalEnds * state.config.lines;
        const segmentsDone = state.completedEndDurations.length;
        const segmentsLeft = totalSegments - segmentsDone;

        if (segmentsLeft > 0) {
            const estRemaining = segmentsLeft * avg;
            const estFinishDate = new Date(new Date().getTime() + estRemaining);
            els.stats.estFinish.textContent = `Est Finish: ${formatTimeOfDay(estFinishDate)}`;
        } else {
            els.stats.estFinish.textContent = `Est Finish: Done`;
        }
    } else {
        els.stats.avgEnd.textContent = `Avg End: --:--`;
        els.stats.estFinish.textContent = `Est Finish: --:--`;
    }
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) {
        return `${h}h${m}m${s}s`;
    } else if (m > 0) {
        return `${m}m${s}s`;
    } else {
        return `${s}s`;
    }
}

function formatTimeOfDay(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderTimer() {
    const seconds = Math.ceil(state.remainingMs / 1000);
    els.timerDigits.textContent = seconds;

    // Warning style
    if (state.status === STATE.SHOOT && seconds <= state.config.warningThreshold && seconds > 0) {
        els.app.classList.add('warning');
    } else {
        els.app.classList.remove('warning');
    }
}

function handleKeydown(e) {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const code = e.code;
    const key = e.key.toLowerCase();

    // d for "pause/resume"
    if (key === 'd') {
        if (!els.btns.pause.disabled) togglePause();
    }

    // f for "finish now"
    if (key === 'f') {
        if (state.status === STATE.PREP || state.status === STATE.SHOOT) finishNow();
    }

    // spacebar for "Next line/end"
    if (code === 'Space') {
        e.preventDefault(); // Prevent scrolling
        if (!els.btns.next.disabled) nextSegment();
    }

    // J for "restart current end"
    if (key === 'j') {
        if (state.status !== STATE.IDLE && state.status !== STATE.FINISHED) restartEnd();
    }

    // k for "reset all"
    if (key === 'k') {
        confirmReset();
    }
}

// Start
init();

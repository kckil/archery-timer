# Archery Timer - Claude Code Guide

## Project Overview

Static web app (no build step, no backend) for archery competition timing.
The UI and timer live in `index.html`, `style.css`, and `script.js`.
Offline installation uses `manifest.webmanifest`, `icons/`, `offline.js`, and `sw.js`.
Vanilla JS only — no external libraries or runtime dependencies.

## Architecture

- **State machine** in `script.js`: `IDLE` -> `PREP` -> `SHOOT` -> `BETWEEN` -> repeat or `FINISHED`
- **Audio**: Web Audio API buzzer signals (1 buzz = shoot, 2 = prep, 3 = end)
- **Config**: All settings persisted in URL query params
- **Theming**: CSS variables for light/dark mode (`body.theme-light` / `body.theme-dark`)
- **State backgrounds**: `body[data-state]` attribute drives timer display colors (red=prep/warning, green=shoot)

## Line order and controls

- **Alternate Ends** (`alternateLines`) defaults to `true` and only affects two-line shooting. `currentLine` identifies AB (`1`) or CD (`2`), not the line's position in an end.
- `getFirstLine(end = state.currentEnd)` returns the starting line for an end. Use it for progression, restarting, and previews; do not assume AB starts or CD finishes every end.
- Alternation uses the absolute end count, including practice ends. The practice-to-scoring transition does not reset it.
- In `BETWEEN`, the right-aligned display shows only the upcoming line and end. The heading is `Next: Practice` for practice ends, otherwise `Next:`; after the last segment it is `Next: Finish`.
- **Simpler Keyboard Controls** (`simplerKeyboardControls`) defaults to `false`. Default mode keeps separate Finish Now (`F`) and Next Line/End (`Space`) buttons.
- In simpler mode, the primary button and Space both call `finishOrAdvance()`: finish while actively running, advance while between segments or paused/restarted. Keep the button label consistent with its action. `F` remains available to finish prep/shoot.
- Ignore repeated Space keydowns to prevent a held key from finishing and advancing. Keep shortcuts inactive while an input or select has focus.
- New settings must be consistent across defaults, input binding, custom-preset restoration, URL loading, and URL serialization.

## Offline support and deployment

- `offline.js` registers `sw.js` and reports readiness only after the app files have been downloaded. Setup/download failures must be visible, not reported as offline-ready.
- `sw.js` uses a versioned, scope-specific precache. Increment the cache version whenever a precached file changes, and add any new required assets to its list.
- Keep paths relative for GitHub Pages project-subdirectory hosting. Navigation to the app root or `index.html` with any query string must use the cached HTML while leaving the URL settings intact.
- Updates wait for existing app tabs/windows to close. Do not force worker activation or reload an ongoing round.
- Delete only older caches for this app scope, not unrelated caches on the same origin.
- Keep required assets local, including icons and fonts. The app uses system font fallbacks rather than requesting Google Fonts.
- Service workers require HTTPS or localhost. A `file://` launch can run the timer but cannot provide offline installation.
- Browser storage can be cleared or evicted. Never promise permanent offline storage.

## Responsive Design

Three breakpoints in `style.css`:

| Breakpoint | Target | Key behavior |
|---|---|---|
| `max-width: 768px` | Phone portrait | Config panel overlays full screen; hotkey labels hidden; timer `25vh` |
| `max-width: 1000px` + `orientation: landscape` | Phone landscape (up to 926px wide) | Timer centered via `margin: auto 0`; buttons at bottom via `margin-top: auto`; compact stats; hotkeys hidden |
| `min-width: 769px` + `max-width: 1024px` | iPad | Sidebar narrowed to 280px |

### Important layout notes

- `.big-labels` is `position: absolute` on desktop, `position: relative` on mobile portrait
- In landscape, `#timer-display` uses `justify-content: flex-start` with `margin: auto` on the timer digits to center them, and `margin-top: auto` on controls to push buttons to bottom
- `.end-number-large` renders end numbers (e.g., "1/2") at 3em on desktop/landscape, reset to 1em inline on portrait mobile
- `.line-name-large` renders line identifiers (AB/CD) at 4em
- `#big-end` is right-aligned (`text-align: right`)
- Hotkey labels (`.hotkey`) are hidden on both mobile breakpoints — keyboard shortcuts are irrelevant on touch devices

## Label/timer opacity by state

The side labels (`.big-labels`) and timer digits (`#timer-digits`) swap prominence based on state:

- **Active** (`prep`/`shoot`): side labels dim, timer stays full brightness
- **Stopped** (`between`): side labels use the theme's `--text-color`, timer dims

Controlled by two CSS variables in `:root` (top of `style.css`):

```css
--label-dim-opacity: 0.45;   /* how dim labels get during active states */
--timer-dim-opacity: 0.3;    /* how dim the timer gets during between state */
```

The rules that apply them are just below the state background rules in `style.css` (search for `/* Active states: dim the side labels */`).

## Key functions in script.js

- `enterState(newState)` — state transitions, starts/stops timer
- `tick(now)` — requestAnimationFrame countdown loop
- `render()` — updates all UI: labels, buttons, stats visibility
- `renderStats()` — calculates and displays timing statistics (between-ends only)
- `handleConfigChange()` — reads form inputs, manages preset/custom logic, updates URL
- `getFirstLine(end)` — resolves starting-line order, including upcoming-end previews
- `finishOrAdvance()` — shared button/Space action, gated by the simpler-controls setting
- `playBuzzerSignal(repeatCount)` — generates dual-tone sawtooth buzzer

## Validation

- Run `node --test` for dependency-free timer and service worker regression tests (`script.test.js` and `offline.test.js`).
- For offline changes, also check first-time download success/failure, offline reopening and refresh with a previously unseen settings URL, root and project-subdirectory hosting, and updates while a timer is running.
- Test both control modes, prep/shoot/between states, paused/restarted behavior, and held Space keys when changing controls.
- Service worker caches can hide local edits. For development, unregister the local worker and clear its app cache, or use a separate origin such as `127.0.0.1` instead of `localhost`.

## Guidelines

- No external dependencies. Keep it vanilla HTML/CSS/JS.
- Both light and dark themes must work — use CSS variables, not hardcoded colors.
- Test responsive changes at: desktop (1280x900), phone portrait (390x844), phone landscape (926x428).
- The timer display must be easily readable from across a room/range — prioritize large, bold text.
- Config is URL-param based — any new settings need `loadConfigFromURL` and `updateURL` updates.
- When serving locally for testing: `python3 -m http.server 8765`

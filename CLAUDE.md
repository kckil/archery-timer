# Archery Timer - Claude Code Guide

## Project Overview

Static web app (no build step, no backend) for archery competition timing. Three files: `index.html`, `style.css`, `script.js`. Vanilla JS only — no external libraries.

## Architecture

- **State machine** in `script.js`: `IDLE` -> `PREP` -> `SHOOT` -> `BETWEEN` -> repeat or `FINISHED`
- **Audio**: Web Audio API buzzer signals (1 buzz = shoot, 2 = prep, 3 = end)
- **Config**: All settings persisted in URL query params
- **Theming**: CSS variables for light/dark mode (`body.theme-light` / `body.theme-dark`)
- **State backgrounds**: `body[data-state]` attribute drives timer display colors (red=prep/warning, green=shoot)

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
- `.end-number-large` renders end numbers (e.g., "1/2") at 4em on desktop/landscape, reset to 1em inline on portrait mobile
- `.line-name-large` renders line identifiers (AB/CD) at 4em
- `#big-end` is right-aligned (`text-align: right`)
- Hotkey labels (`.hotkey`) are hidden on both mobile breakpoints — keyboard shortcuts are irrelevant on touch devices

## Label/timer opacity by state

The side labels (`.big-labels`) and timer digits (`#timer-digits`) swap prominence based on state:

- **Active** (`prep`/`shoot`): side labels dim, timer stays full brightness
- **Stopped** (`between`): side labels go bright white, timer dims

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
- `playBuzzerSignal(repeatCount)` — generates dual-tone sawtooth buzzer

## Guidelines

- No external dependencies. Keep it vanilla HTML/CSS/JS.
- Both light and dark themes must work — use CSS variables, not hardcoded colors.
- Test responsive changes at: desktop (1280x900), phone portrait (390x844), phone landscape (926x428).
- The timer display must be easily readable from across a room/range — prioritize large, bold text.
- Config is URL-param based — any new settings need `loadConfigFromURL` and `updateURL` updates.
- When serving locally for testing: `python3 -m http.server 8765`

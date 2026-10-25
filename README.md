# Archery Timer

A web-based, client-side archery countdown timer designed for USA Archery style rounds. It supports single or dual shooting lines, practice ends, and persists configuration via URL parameters.

## 🚀 Getting Started

This is a static web application with no build step or backend dependencies.

1.  **Clone the repository.**
2.  **Open `index.html`** in any modern web browser.

That's it! You can run it locally or host it on any static site provider (GitHub Pages, Netlify, Vercel, etc.).

### Running a local development server

Some browser features (e.g. Web Audio) work more reliably over HTTP than via `file://`. To serve the app locally:

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765` in your browser.

### Offline use and home-screen installation

Open the app online over HTTPS (or localhost) and wait for **Ready for offline use**
below Start Round. The complete app is then cached for reopening without internet,
including bookmarked URLs with custom timer settings. Fonts use local system
fallbacks, so the timer has no external font dependency.

On Android, use the browser's **Install app** or **Add to Home screen** option.
On iPhone or iPad, open in Safari and use **Share > Add to Home Screen**.
Installation is optional for offline use. Browser data clearing, storage eviction,
or private browsing can remove cached files; check offline readiness before leaving
connectivity and try reopening in airplane mode.

Updates download in the background without reloading a running timer. When an
update is ready, close all app tabs/windows and reopen to apply it.

When deploying changes to any app file, increment `CACHE_NAME`'s version in `sw.js`.
Keep all required files in its precache list. Paths are relative, so root hosting
and GitHub Pages project subdirectories are supported. Offline support requires
HTTP on localhost or HTTPS elsewhere; opening `index.html` directly is not enough.

## 📂 Project Structure

*   **`index.html`**: The main entry point. Contains the HTML structure for the timer display, configuration panel, and controls.
*   **`style.css`**: All styling logic.
    *   Uses CSS variables for theming (Light/Dark).
    *   Handles responsive layout (Desktop vs. Mobile).
    *   Manages state-based background colors (Red for Prep/Warning, Green for Shoot, Theme-color for Between).
*   **`script.js`**: The core application logic.
    *   **State Machine**: Manages transitions between `IDLE`, `PREP`, `SHOOT`, `BETWEEN`, and `FINISHED`.
    *   **Audio**: Uses the Web Audio API to generate buzzer tones.
    *   **Configuration**: Handles reading/writing config to URL parameters.
    *   **Timing Stats**: Calculates and displays duration statistics.
*   **`manifest.webmanifest`** and **`icons/`**: Home-screen installation metadata and local app icons.
*   **`offline.js`**: Registers the service worker and displays offline readiness, setup errors, and available updates.
*   **`sw.js`**: Precaches app files and serves them offline, including URLs with custom settings.
*   **`script.test.js`** and **`offline.test.js`**: Dependency-free Node.js regression tests for timer behavior and offline support.
*   **`CLAUDE.md`**: Implementation guidance for coding agents.

## 🛠️ Development Guide

### Key Logic Locations

*   **State Transitions**: Look for the `enterState(newState)` and `tick(now)` functions in `script.js`.
*   **Timer Logic**: The `tick` function handles the countdown. `handleTimerExpired` determines what happens when time runs out.
*   **Configuration**: `DEFAULTS` object and `handleConfigChange` function in `script.js`.
*   **Audio**: `playBuzzerSignal` in `script.js` generates the dual-tone sounds.
*   **Line Order**: `getFirstLine(end)` determines which line starts an end.
*   **Combined Control**: `finishOrAdvance` selects the action shared by the primary button and Space shortcut.

### Making Changes

1.  **Preserve Behavior**: Use the settings and controls documented here, and check the existing state transitions before changing timing behavior.
2.  **Mobile First**: Ensure any UI changes work on small screens. The app is designed to be usable on phones.
3.  **Theme Compatibility**: Any new UI elements must support both Light and Dark modes using the existing CSS variables.
4.  **No External Deps**: Do not add external libraries (jQuery, Bootstrap, etc.) unless absolutely necessary. Keep it vanilla.

### Regression tests

Run the tests with Node.js; no package installation is required:

```bash
node --test
```

For visual changes, check desktop (1280x900), phone portrait (390x844), and phone
landscape (926x428) in both themes. The Node.js tests do not replace browser checks
for layout, audio, service worker installation, or offline reopening.

## Round settings and controls

**Alternate Ends** is checked by default for two-line shooting. The first end runs
AB then CD, the second CD then AB, and so on. Alternation continues across practice
and scoring ends without resetting at the scoring transition. Uncheck it to always
run AB first. The setting is disabled and ignored for single-line shooting.
Restarting an end returns to that end's correct first line and pauses the timer.

While stopped, the right-aligned display shows only what comes next: **Next:**
(or **Next: Practice**) above the line and end number, such as **CD 1/2**.
Between lines, the end number stays the same; after both lines finish, it advances.
After the final line of the final end, it shows **Next: Finish**.

**Simpler Keyboard Controls**, at the bottom of settings, is unchecked by default.
When enabled, one primary button switches between **Finish Now** while running and
**Next Line/End** while waiting or paused. Space performs the same action.

| Action | Default controls | Simpler Keyboard Controls |
|---|---|---|
| Finish an active prep/shoot segment early | Finish Now button or `F` | Combined button or `Space`; `F` also works |
| Advance while waiting | Next Line/End button or `Space` | Combined button or `Space` |
| Advance while paused/restarted | Next Line/End button or `Space` | Combined button or `Space` |
| Pause/resume | `D` | `D` |
| Restart current end, paused at its first line | `J` | `J` |
| Reset round (with confirmation) | `K` | `K` |
| Toggle timer format | `T` | `T` |

Holding Space does not repeat finish/advance actions. Timer shortcuts are ignored
while an input or select has focus. Hotkey hints are hidden on phone layouts.

## 🎨 Theming

The app supports Light and Dark modes.
*   **Light Mode**: White/Grey background, Green shooting background.
*   **Dark Mode**: Dark Grey background, Green shooting background.

Toggle the theme in the configuration panel to test both.

## 🔗 URL Configuration

All settings are saved in the URL query string. This allows users to bookmark their specific setup (e.g., "Indoor 18m, 2 Lines").
*   When adding new config options, ensure they are added to `loadConfigFromURL` and `updateURL` in `script.js`.

| Setting | URL parameter | Default |
|---|---|---|
| Alternate Ends | `alternateLines=true` or `alternateLines=false` | `true` |
| Simpler Keyboard Controls | `simplerKeyboardControls=true` or `simplerKeyboardControls=false` | `false` |

Explicit values in bookmarked URLs override these defaults.

## Acknowledgments

This timer was written for [Sky Valley Archery Academy (Ed Eliason JOAD)](https://skyvalleyarcheryacademy.wordpress.com/) in Monroe, WA.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# Archery Timer

A web-based, client-side archery countdown timer designed for USA Archery style rounds. It supports single or dual shooting lines, practice ends, and persists configuration via URL parameters.

## 🚀 Getting Started

This is a static web application with no build step or backend dependencies.

1.  **Clone the repository.**
2.  **Open `index.html`** in any modern web browser.

That's it! You can run it locally or host it on any static site provider (GitHub Pages, Netlify, Vercel, etc.).

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
*   **`Archery Timer Requirements.txt`**: The source of truth for functional requirements and specifications. **Always check this before making feature changes.**

## 🛠️ Development Guide

### Key Logic Locations

*   **State Transitions**: Look for the `enterState(newState)` and `tick(now)` functions in `script.js`.
*   **Timer Logic**: The `tick` function handles the countdown. `handleTimerExpired` determines what happens when time runs out.
*   **Configuration**: `DEFAULTS` object and `handleConfigChange` function in `script.js`.
*   **Audio**: `playBuzzerSignal` in `script.js` generates the dual-tone sounds.

### Making Changes

1.  **Check Requirements**: Refer to `Archery Timer Requirements.txt` to understand the intended behavior.
2.  **Mobile First**: Ensure any UI changes work on small screens. The app is designed to be usable on phones.
3.  **Theme Compatibility**: Any new UI elements must support both Light and Dark modes using the existing CSS variables.
4.  **No External Deps**: Do not add external libraries (jQuery, Bootstrap, etc.) unless absolutely necessary. Keep it vanilla.

## 🎨 Theming

The app supports Light and Dark modes.
*   **Light Mode**: White/Grey background, Green shooting background.
*   **Dark Mode**: Dark Grey background, Green shooting background.

Toggle the theme in the configuration panel to test both.

## 🔗 URL Configuration

All settings are saved in the URL query string. This allows users to bookmark their specific setup (e.g., "Indoor 18m, 2 Lines").
*   When adding new config options, ensure they are added to `loadConfigFromURL` and `updateURL` in `script.js`.

## Acknowledgments

This timer was written for [Sky Valley Archery Academy (Ed Eliason JOAD)](https://skyvalleyarcheryacademy.wordpress.com/) in Monroe, WA.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

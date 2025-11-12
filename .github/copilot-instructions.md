## Quick orientation

- This is a static, single-page dashboard UI for the SitSense IoT project. The UI is plain HTML/CSS/JS (no build step). Major folders: `assets/` (CSS, JS, images, audio), `components/` (re-usable HTML fragments loaded at runtime), and `auth/` (auth pages).
- The app boots from `index.html`. Many UI pieces are injected at runtime with `fetch('./components/..')` (see `index.html` lines that load `sidebar`, `panel-parameters`, `footer`, `modal-detail`).

## Big-picture architecture

- Browser-only frontend that connects to Firebase Realtime Database. Firebase is initialized in `index.html` (compat libs) and exposed via `window.firebaseAuth` and `window.firebaseDb`.
- Live data path: `/devices/{deviceId}/live`. Device metadata: `/devices/{deviceId}/info`. See `assets/js/app.js` for connection, `auth.signInAnonymously()` and listeners.
- UI responsibilities are split into small JS modules under `assets/js/` (e.g. `app.js` handles core data flow and scoring, `charts.js` handles Chart.js, `posture-visual.js` provides heatmap logic, `ai-gemini.js` implements Gemini integrations).
- Some experimental functionality is embedded as an iframe: `components/monitoring-tubuh.html` (React experiment). Messaging uses `window.postMessage` events (`SITSENSE_ULTRA_UPDATE`).

## Important globals / integration points

- `window.firebaseAuth`, `window.firebaseDb` — Firebase auth/database instances.
- `window.BACKEND_ENDPOINT` — optional backend proxy; default `null` in `index.html`.
- `window.__GEMINI_PROXY_URL` or direct `SitSenseAI.setConfig({ apiKey })` — Gemini/AI integration options (see bottom of `index.html`).
- `window.updateBalanceUI`, `window.updateHeatmap`, `window.initPostureVisual`, `window.SitSenseCharts` — functions/objects other modules call. Prefer using these exported globals rather than reimplementing listeners.

## Project-specific conventions & gotchas

- Components are injected into the DOM via fetch() and innerHTML — code must tolerate duplicated IDs and elements being added later. Prefer using querySelectorAll to find all elements that share an id instead of assuming a single element returned by querySelector.
- `panel-parameters` dispatches a custom event `panel-parameters-loaded` after inject — listen for it to re-run UI updates (see `app.js` listener). Avoid assuming synchronous DOM availability.
- Lots of defensive/robust update logic exists (MutationObserver, retries). Follow existing patterns: prefer calling provided update functions (`updateBalanceUI`, `updateUltrasonicUI`, etc.) instead of directly manipulating element internals.
- Firebase uses compat libraries and anonymous sign-in. Device id resolution order: URL `?device=ID`, `localStorage.sitsense_device`, then auto-detect via `/devices` in Firebase (see `resolveDeviceId()` in `app.js`).

## How to run locally (dev tips)

- Serve the repo from the project root over a local static server to avoid fetch/iframe 404s (components and relative paths assume an HTTP server). Example quick server: run `python3 -m http.server 8000` in the repo root and open `http://localhost:8000/`.
- The app expects Firebase config already present in `index.html`. If you want to test without a device, you can stub Firebase by setting `window.firebaseDb`/`window.firebaseAuth` in the console or by mocking the `/devices/...` paths.

## Editing guidance for AI agents

- When editing behavior, prefer changing functions in `assets/js/` (e.g. `app.js`, `charts.js`) and keep DOM structure in `components/*.html` unchanged unless adjusting layout.
- Add public helper methods to `window.` if other modules must call them (pattern used widely in this project).
- For improvements that affect multiple components, update `components/` fragments (they are small HTML files) and rely on the injection points in `index.html` — do not hard-code component HTML into `index.html`.

## Files to inspect first (examples)

- `index.html` — bootstrapping, Firebase config, and where components are injected.
- `assets/js/app.js` — main data flow, scoring logic (`calculatePostureScore`), and Firebase listeners.
- `assets/js/posture-visual.js` — heatmap / canvas logic (visualization entry point `initPostureVisual` / `updateHeatmap`).
- `components/panel-parameters.html` — contains the balance elements: balanceLRFill, balanceFBFill, balanceLRVal, balanceFBVal and triggers `panel-parameters-loaded`.
- `assets/js/ai-gemini.js` and `assets/js/tts-google.js` — AI + TTS integration points and examples for voice/output.

If anything above is unclear or you want the file to be expanded with code snippets or more examples, tell me which sections to expand and I will iterate. 

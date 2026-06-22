# Changelog

All notable changes to the **AI Footprint** extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-22

First public release.

### Added
- Live status bar item showing today's AI score; click to open the dashboard.
- Persistent daily stats with real midnight rollover and a clean-day streak.
- Honest "AI Reliance %" metric (pasted lines ÷ total lines added today).
- 7-day score sparkline on the dashboard.
- Clipboard-aware paste detection — distinguishes pastes from snippets and
  recognizes "my own code from another file" to avoid false positives.
- Per-language typing cadence baselines using median + MAD for robustness.
- Commands: `Snooze Nudges for 30 Minutes`, `Export Data`, `Clear All Data`.
- Settings: `clipboardAware`, `showStatusBar`, `quietWhileDebugging`.
- First-run onboarding toast explaining what the extension watches.
- Unit tests for pure helpers (median/MAD, line counting, date math).

### Changed
- Dashboard now renders a stable HTML shell and updates via `postMessage`
  rather than re-rendering the whole webview on every paste.
- Nudges suppress automatically during active debug sessions (configurable).
- Score deduction is capped at 25 points per single paste so one outlier
  cannot tank an entire day.

### Fixed
- Snooze is now an explicit `snoozeUntil` timestamp instead of a future-dated
  `lastNudgeTime` (the previous form worked only by accident).
- `todayPastes` and `aiScore` now persist across reloads — they previously
  lived as local variables in `activate()` and reset on every restart.

### Security / Privacy
- All data remains in VS Code's per-machine `globalState`. The extension
  makes no network requests. `Export Data` and `Clear All Data` commands
  give users full control.

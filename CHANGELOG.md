# Changelog

All notable changes to the **AI Footprint** extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-30

### Changed
- **Publisher rename: `biyelaayanda3` → `codewithayanda`.** This creates a new VS Code
  Marketplace listing. Existing users of `biyelaayanda3.ai-footprint` will not auto-upgrade;
  they must uninstall the old extension and install the new one. The old extension's stored
  history (streak, daily stats, cadence baselines) lives under a different extension
  identity and cannot be migrated automatically. Run `AI Footprint: Export Data` on the
  old version first if you want a JSON copy.
- `DashboardPanel` no longer computes reliance % itself. All derived numbers come from
  `StatsService`, so future surfaces (status bar tooltip, hover, etc.) share the same math.

### Added
- `DayRecord` now captures `biggestPasteLines` (largest single paste of the day) and
  `hourlyPastes` (24-bucket distribution of when pastes happened during the day). Old
  records are backfilled with zeroed values on load, so no data is lost.
- Snapshot includes `reliance %`, `avg7` (average over the 6 prior active days, excluding
  zero-activity days so the baseline stays honest), and `deltas` comparing today to
  yesterday and to the 7-day average. Each delta is `null` when the comparison window has
  no qualifying data, never silently 0.
- Dashboard: 14-day interactive bar chart with click-to-select per-day detail panel,
  hourly paste distribution chart, count-up number animations, color-tinted score card,
  and separated current / best streak cards.

## [0.1.0] - 2026-06-22

First public release.

### Added
- Live status bar item showing today's AI score; click to open the dashboard.
- Persistent daily stats with real midnight rollover and a clean-day streak.
- Honest "AI Reliance %" metric (pasted lines ÷ total lines added today).
- 7-day score sparkline on the dashboard.
- Clipboard-aware paste detection that distinguishes pastes from snippets and
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
- `todayPastes` and `aiScore` now persist across reloads; they previously
  lived as local variables in `activate()` and reset on every restart.

### Security / Privacy
- All data remains in VS Code's per-machine `globalState`. The extension
  makes no network requests. `Export Data` and `Clear All Data` commands
  give users full control.

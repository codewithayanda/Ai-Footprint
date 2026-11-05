# Changelog

All notable changes to the **AI Footprint** extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Ignore files and languages.** Two new settings stop AI Footprint counting anything in
  matching files: `aiFootprint.excludeGlobs` (by default lockfiles, minified and
  generated files, `dist`, `out`, `node_modules` and Git's own files) and
  `aiFootprint.excludeLanguages` (empty by default; for example `markdown`). Changes
  apply immediately.

### Fixed
- **Two VS Code windows overwrote each other's stats.** Each window kept its own copy of
  the history and saved the whole thing, so the window that saved last erased what the
  other had recorded. Windows now add only their own changes on top of what is stored
  (pastes, lines and nudges add up, score deductions combine, the biggest paste takes
  the larger value), and each window picks up the other's saved changes within about 10
  seconds. Clearing data in one window is no longer undone by another. If two windows
  save at the same instant one update can still be lost; VS Code offers no lock to
  prevent that.
- **Moving your own code was counted as a paste.** The old "own code" check was fed only
  by single-keystroke edits (and ignored anything under 16 characters), so it never
  matched, and even when it did it only muted the nudge while still lowering the score.
  A paste is now ignored completely when its text is already in another open file, or
  already elsewhere in the same file (whitespace and indentation are ignored, and very
  short text never matches). Text pasted from a browser, chat or terminal is still counted.
- **Large edits that never came from the clipboard were counted as pastes.** With
  `clipboardAware` on, a paste-sized insertion that doesn't match the clipboard
  (format on save, rename or refactor results, snippet expansion) is now ignored. If
  the clipboard is unreadable or empty the insertion is still counted. Inline AI
  completions don't pass through the clipboard either, so they are no longer counted
  while this setting is on.
- Changing `aiFootprint.clipboardAware` now takes effect immediately instead of
  after a reload.
- **Pulled or checked-out code was flagged as pasted.** When VS Code reloads an open
  file from disk (`git pull`, `git switch`, rebase, `git stash pop`), the buffer now
  matches the file on disk, and a paste-sized change that does is ignored. Edits you
  make in the editor never match disk, so real pastes are still counted. Small
  reloaded hunks below the paste threshold are still counted as typed lines.
- **Undo and Redo were counted as pastes.** Undoing a large deletion re-inserts the
  text; those edits are now ignored.
- **AI Reliance % was understated.** Every typed character was recorded as a "typed
  line" (and Enter with auto-indent as two), inflating the denominator of
  `pasted lines ÷ total lines added`. Typing now counts only the line breaks it
  actually inserts. Days recorded by earlier versions keep their old, too-low
  reliance figure; there is no way to recompute them.
- **The streak grew on days you didn't code.** Opening VS Code created an empty record
  for the day, and an empty record counted as clean. Only days with real activity can
  extend or break the streak now. Streaks already inflated by this are not corrected.
- **"Clear All Data" left nudge history, snooze and typing baselines alive in memory.**
  They were wiped from storage and then written straight back. They are now reset in
  memory too.

- **The typing-speed baseline was recalculated and saved on every keystroke** once its
  200-sample window filled. It now updates every 50 intervals, moves 30% toward the new
  window instead of replacing the stored baseline, and skips windows that are already
  flagged as fast so a burst can't drag the baseline toward itself.
- **A held-down key counted as suspiciously fast typing.** Intervals under 35 ms
  (key auto-repeat) are now ignored.
- **The fast-typing nudge said "1 lines added at once".** It now says code is arriving
  faster than you usually type; the line count is kept for real large insertions.

### Changed
- **The dashboard follows a strict content security policy.** Its markup, styles and
  script now live in separate files under `media/dashboard` instead of one inline block,
  so the page no longer needs `unsafe-inline`: only the one script carrying a fresh
  random nonce can run, and styles load from the extension's own file. The page looks
  and behaves the same. Colours, spacing, type sizes and animation timings are now named
  tokens at the top of the stylesheet.
- **Stats are no longer rewritten on every edit.** Saving to VS Code storage is now
  limited to once every 5 seconds, and the status bar and dashboard update in batches
  of 250 ms. Pending changes are saved when VS Code closes, so only a hard crash can
  lose the last few seconds.

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

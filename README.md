# AI Footprint

A VS Code extension that helps you stay honest about how much you're relying on AI to write your code.

It's not anti-AI. It's pro-understanding.

---

## Why I Built This

AI coding tools are genuinely useful. But there's a difference between using AI as a tool and using AI as a crutch — and that line is easier to cross than most developers admit.

I noticed a pattern: paste some code from Claude or ChatGPT, it works, move on. Repeat. Eventually you're sitting in a codebase you don't fully understand, and that's a problem that compounds quietly over time.

AI Footprint watches how your code arrives in the editor. It tracks paste behavior, typing cadence, and how much time you spend reviewing what you add. When it notices something worth flagging, it says something — once, without being annoying about it.

Think of it as a senior developer sitting next to you, not to judge, but to ask: *do you actually understand what you just added?*

---

## What It Does

**Paste Detection**
When a large block of code appears at once, the extension notices. It doesn't assume the worst — maybe you're copying your own code from another file. But if it happens repeatedly, it keeps track.

**Typing Cadence Tracking**
The extension learns your personal typing rhythm over time. When code appears significantly faster than your normal pace, it flags it. Humans type with pauses, thinking breaks, and backspaces. AI output doesn't.

**Smart Nudges**
Three levels of nudge depending on severity — a subtle status bar message, a warning popup, or a stronger alert for very large insertions. There's a cooldown between nudges so it never feels like nagging. You can snooze for 30 minutes if you're in the middle of something, and nudges automatically go quiet during debug sessions.

**Live Dashboard + Status Bar**
A status bar item shows your live AI score — click it to open the dashboard. The dashboard updates in real time and shows your score for the day, pastes, nudges, clean-day streak, an honest *AI Reliance %* (lines that arrived via paste ÷ all lines added today), and a 7-day sparkline. The score isn't meant to shame you — it's meant to make the invisible visible.

**Your Data, Your Machine**
Everything is stored locally in VS Code's `globalState`. You can export your history to JSON at any time, or wipe it completely with a single command.

**Fully Configurable**
Every threshold is adjustable in VS Code settings. You decide what counts as a large paste, how long the cooldown is, whether to cross-check the clipboard, whether the status bar shows, and whether nudges are silenced while debugging.

---

## Getting Started

**Requirements**
- VS Code 1.125 or higher
- Node.js 18 or higher (for development)

**Install from a release (recommended)**

Grab the latest `.vsix` file from the [Releases page](https://github.com/biyelaayanda3/ai-footprint/releases) and install it with one command:

```bash
code --install-extension ai-footprint-0.1.0.vsix
```

Or install it from inside VS Code:
`Extensions panel → ⋯ menu → Install from VSIX…` and pick the downloaded file.

To update later, download the new `.vsix` and run the same command — VS Code will replace the previous version.

**Install from Marketplace**
Coming soon. For now, use the release download above.

**Install from source**
```bash
git clone https://github.com/biyelaayanda3/ai-footprint.git
cd ai-footprint
npm install
npm run compile
```
Then press `F5` in VS Code to launch the extension in development mode.

---

## Usage

Once installed the extension activates automatically when VS Code starts. No setup needed.

**Commands** (all available via `Ctrl + Shift + P`)

| Command | What it does |
|---|---|
| `AI Footprint: Show Dashboard` | Open the live dashboard |
| `AI Footprint: Snooze Nudges for 30 Minutes` | Quiet things down |
| `AI Footprint: Export Data` | Save your last 30 days of history to JSON |
| `AI Footprint: Clear All Data` | Wipe everything the extension has stored |

**Adjust your settings**
```
File → Preferences → Settings → search "AI Footprint"
```

| Setting | Default | Description |
|---|---|---|
| `aiFootprint.enabled` | true | Toggle monitoring on or off |
| `aiFootprint.pasteThreshold` | 5 | Lines added at once to trigger detection |
| `aiFootprint.cooldownMinutes` | 5 | Minutes between nudges |
| `aiFootprint.clipboardAware` | true | Cross-check insertions against the OS clipboard for more accurate paste detection |
| `aiFootprint.showStatusBar` | true | Show the live score in the status bar |
| `aiFootprint.quietWhileDebugging` | true | Suppress nudges while a debug session is active |

---

## How the AI Score Works

Your score starts at 100 each day and decreases when large pastes are detected. The more lines pasted at once, the bigger the deduction — but a single paste can never cost you more than 25 points, so one outlier won't tank your whole day. The score resets every day — yesterday doesn't count against you, but a clean day (score stayed at 80 or higher) extends your streak.

| Score | Status |
|---|---|
| 80–100 | You're writing most of your code manually. Good. |
| 50–79 | Some AI reliance detected. Keep an eye on it. |
| 0–49 | Heavy AI usage today. Worth going back and reviewing. |

The score isn't a judgment. It's just information — the kind that's easy to ignore without something making it visible.

---

## What This Doesn't Do

- It doesn't block AI tools or prevent you from pasting code
- It doesn't send any data anywhere — everything stays local on your machine
- It doesn't know *where* your code came from, only *how* it arrived
- It won't fire every five minutes and kill your focus

---

## Project Structure

```
src/
├── extension.ts              ← entry point, wires everything together
├── constants.ts              ← tunable defaults (scoring, cadence, nudge levels)
├── detectors/
│   ├── cadenceTracker.ts     ← per-language typing rhythm (median + MAD)
│   └── pasteDetector.ts      ← clipboard-aware paste classification
├── nudge/
│   └── nudgeEngine.ts        ← when and how to nudge
├── services/
│   └── statsService.ts       ← daily stats, midnight rollover, streak, events
├── ui/
│   └── dashboardPanel.ts     ← webview dashboard (postMessage updates)
└── config/
    └── settings.ts           ← user settings helper
```

---

## Contributing

This is an open project and contributions are welcome. If you have an idea for improving the detection logic, the dashboard, or the nudge system — open an issue and let's talk about it first before jumping into code.

```bash
git clone https://github.com/biyelaayanda3/ai-footprint.git
cd ai-footprint
npm install
```

Please keep PRs focused — one thing per pull request makes review much easier.

---

## Roadmap

These are things I want to build next, in rough priority order:

- [ ] Review score — track whether the developer explored pasted code before moving on
- [ ] Weekly summary — a breakdown of your AI usage over the past 7 days
- [ ] Per-language stats — see which file types you rely on AI for most
- [x] Clean-day streak — consecutive days where your score stayed above the clean threshold
- [x] Export report — JSON export of your history for self-reflection or team use

---

## Author

Built by [@biyelaayanda3](https://github.com/biyelaayanda3)

A junior developer with 4 years of experience who got tired of not knowing what was in his own codebase — and decided to build something about it.

---

## License

MIT — do whatever you want with it, just don't remove the attribution.
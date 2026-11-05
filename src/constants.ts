export const STORAGE_KEYS = {
	dailyStats: 'aiFootprint.dailyStats.v2',
	streak: 'aiFootprint.streak.v2',
	cadenceBaselines: 'aiFootprint.cadenceBaselines.v2',
	nudgeHistory: 'aiFootprint.nudgeHistory.v2',
	snoozeUntil: 'aiFootprint.snoozeUntil.v2',
	onboarded: 'aiFootprint.onboarded.v1',
} as const;

export const CADENCE = {
	// Longer edits are paste, snippet or autocomplete, not typing.
	maxCharsPerKeystroke: 2,
	maxIntervalMs: 5_000,
	// Key auto-repeat fires about every 30 ms: a held key, not typing.
	minIntervalMs: 35,
	minSamplesForBaseline: 40,
	windowSize: 200,
	baselineUpdateEvery: 50,
	// Share of the window median blended into the stored baseline per update.
	baselineWeight: 0.3,
	// Current median this many times faster than baseline counts as suspiciously fast.
	fastMultiplier: 3,
} as const;

export const SCORING = {
	linesPerPoint: 5,
	maxDeductionPerPaste: 25,
	startingScore: 100,
	// Minimum score for a day to extend the streak.
	cleanDayThreshold: 80,
} as const;

export const PERSISTENCE = {
	writeIntervalMs: 5_000,
	// Edits within this window collapse into one UI update.
	emitDelayMs: 250,
	// How often to check whether another window saved new stats.
	pullIntervalMs: 10_000,
} as const;

export const NUDGE = {
	subtleLines: 5,
	warningLines: 15,
	strongLines: 30,
	snoozeMinutes: 30,
	statusBarMs: 8_000,
} as const;

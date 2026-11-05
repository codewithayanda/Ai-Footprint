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
	minSamplesForBaseline: 40,
	windowSize: 200,
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
} as const;

export const NUDGE = {
	subtleLines: 5,
	warningLines: 15,
	strongLines: 30,
	snoozeMinutes: 30,
	statusBarMs: 8_000,
} as const;

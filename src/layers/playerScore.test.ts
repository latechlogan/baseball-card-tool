import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePlayer, getPAConfidenceTier, getAgeVsLevelDelta, applyHardFilters } from './playerScore.js';
import { getUserConfig } from '../config.js';
import type { Player } from '../types.js';

const config = getUserConfig();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<Player> & { stats?: Partial<Player['stats']> }): Player {
  const base: Player = {
    name: 'Test Player',
    playerId: 'test-001',
    age: 20,
    level: 'A+',
    org: 'NYY',
    isTwoWay: false,
    position: 'OF',
    stats: {
      pa: 250,
      ab: 215,
      wrcPlus: 155,
      kPct: 18,
      bbPct: 14,
      bbKRatio: 0.80,
      xbhPct: 41,
    },
  };
  const { stats, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    stats: { ...base.stats, ...stats },
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Elite prospect
// Expected: eligible, high confidence, score in 85–100 range
//
// Scoring breakdown (PA 280 → high, ×1.0):
//   age delta (20-18=2)  → +20
//   wRC+ 165 ≥ 160       → +40
//   xbhPct 46 ≥ 45       → +20
//   bbKRatio 1.1 ≥ 1.0   → +15
//   KATOH undefined      →   0 (flag: KATOH_UNAVAILABLE)
//   raw 95 × 1.0 = 95 → round(95/103×100) = 92
// ---------------------------------------------------------------------------
test('elite prospect — young for level, elite stats, high PA', () => {
  const player = makePlayer({
    age: 18,
    level: 'A+',
    stats: { pa: 280, ab: 240, wrcPlus: 165, kPct: 17, bbPct: 18, bbKRatio: 1.1, xbhPct: 46 },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'high');
  assert.ok(result.score >= 85 && result.score <= 100, `score ${result.score} not in 85–100`);
  assert.equal(result.score, 92);
  assert.ok(result.flags.includes('KATOH_UNAVAILABLE'));
  assert.ok(!result.flags.includes('OLD_FOR_LEVEL'));
});

// ---------------------------------------------------------------------------
// Test 2 — Solid watch-list prospect
// Expected: eligible, high confidence, age-appropriate (score reflects 0 age pts)
//
// Note: wRC+ 148 falls in the 140–149 bracket (+15 pts) — WRC_BELOW_THRESHOLD
// is only added when wRC+ < 140. Score reflects realistic watch-list value.
//
// Scoring breakdown (PA 220 → high, ×1.0):
//   age delta (21-21=0)  →   0
//   wRC+ 148 (140–149)   → +15
//   xbhPct 38 (35–39)    →  +6
//   bbKRatio 0.72 (≥0.50)→  +5
//   KATOH undefined      →   0 (flag: KATOH_UNAVAILABLE)
//   raw 26 × 1.0 = 26 → round(26/103×100) = 25
// ---------------------------------------------------------------------------
test('solid watch-list prospect — age-appropriate, decent stats, high PA', () => {
  const player = makePlayer({
    age: 21,
    level: 'AA',
    stats: { pa: 220, ab: 190, wrcPlus: 148, kPct: 19, bbPct: 14, bbKRatio: 0.72, xbhPct: 38 },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'high');
  assert.equal(result.score, 25);
  assert.ok(result.flags.includes('KATOH_UNAVAILABLE'));
  // wRC+ 148 ≥ 140 → no WRC_BELOW_THRESHOLD
  assert.ok(!result.flags.includes('WRC_BELOW_THRESHOLD'));
});

// ---------------------------------------------------------------------------
// Test 3 — Small sample flier
// Expected: eligible, LOW confidence, flag SMALL_SAMPLE_WATCH_ONLY
//
// Scoring breakdown (PA 130 → low, ×0.5):
//   age delta (19-17=2)  → +20
//   wRC+ 162 ≥ 160       → +40
//   xbhPct 44 (40–44)    → +12
//   bbKRatio 0.95 (≥0.75)→ +10
//   KATOH undefined      →   0 (flag: KATOH_UNAVAILABLE)
//   raw 82 × 0.5 = 41.0 → round(41.0/103×100) = 40
// ---------------------------------------------------------------------------
test('small sample flier — great profile but low PA', () => {
  const player = makePlayer({
    age: 17,
    level: 'A',
    position: 'SS',
    stats: { pa: 130, ab: 112, wrcPlus: 162, kPct: 16, bbPct: 15, bbKRatio: 0.95, xbhPct: 44 },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'low');
  assert.equal(result.score, 40);
  assert.ok(result.flags.includes('SMALL_SAMPLE_WATCH_ONLY'));
  assert.ok(result.flags.includes('KATOH_UNAVAILABLE'));
});

// ---------------------------------------------------------------------------
// Test 4 — Strikeout concern
// Expected: ineligible, flag KPCT_EXCEEDS_THRESHOLD
// K% 24 > kPctMax 20 → hard filter triggers before any scoring
// ---------------------------------------------------------------------------
test('strikeout concern — K% exceeds hard cap', () => {
  const player = makePlayer({
    age: 22,
    level: 'AAA',
    stats: { pa: 240, ab: 200, wrcPlus: 155, kPct: 24, bbPct: 19, bbKRatio: 0.80, xbhPct: 40 },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, false);
  assert.equal(result.score, 0);
  assert.ok(result.flags.includes('KPCT_EXCEEDS_THRESHOLD'));
  assert.ok(!result.flags.includes('PITCHER_EXCLUDED'));
});

// ---------------------------------------------------------------------------
// Test 5 — Pitcher (not two-way)
// Expected: ineligible, flag PITCHER_EXCLUDED
// ---------------------------------------------------------------------------
test('pitcher (non-two-way) — excluded immediately', () => {
  const player = makePlayer({
    position: 'P',
    isTwoWay: false,
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, false);
  assert.equal(result.score, 0);
  assert.ok(result.flags.includes('PITCHER_EXCLUDED'));
  assert.ok(!result.flags.includes('TWO_WAY_MANUAL_REVIEW'));
});

// ---------------------------------------------------------------------------
// Test 6 — Two-way player
// Expected: ineligible BUT flag TWO_WAY_MANUAL_REVIEW (not PITCHER_EXCLUDED)
// Two-way players surface for manual review rather than being silently dropped.
// ---------------------------------------------------------------------------
test('two-way player — ineligible with manual review flag, not pitcher excluded', () => {
  const player = makePlayer({
    position: 'P',
    isTwoWay: true,
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, false);
  assert.equal(result.score, 0);
  assert.ok(result.flags.includes('TWO_WAY_MANUAL_REVIEW'));
  assert.ok(!result.flags.includes('PITCHER_EXCLUDED'));
});

// ---------------------------------------------------------------------------
// Test 7 — Old for level
// Expected: eligible, flag OLD_FOR_LEVEL, lower score than age-appropriate peer
//
// Scoring breakdown — old player (age 24, A+, delta = 20-24 = -4, ×1.0):
//   age delta -4 (≤ -2)  → -20  (flag: OLD_FOR_LEVEL)
//   wRC+ 155 (150–159)   → +30
//   xbhPct 42 (40–44)    → +12
//   bbKRatio 0.80 (≥0.75)→ +10
//   raw 32 × 1.0 = 32 → round(32/103×100) = 31
//
// Same player at age 20 (delta=0): raw 52 → score 50
// ---------------------------------------------------------------------------
test('old for level — age 24 at A+, penalized age score and flag applied', () => {
  const oldPlayer = makePlayer({
    age: 24,
    level: 'A+',
    stats: { pa: 220, ab: 190, wrcPlus: 155, kPct: 18, bbPct: 15, bbKRatio: 0.80, xbhPct: 42 },
  });

  const ageAppropriatePlayer = makePlayer({
    age: 20,
    level: 'A+',
    stats: { pa: 220, ab: 190, wrcPlus: 155, kPct: 18, bbPct: 15, bbKRatio: 0.80, xbhPct: 42 },
  });

  const oldResult = scorePlayer(oldPlayer, config);
  const peerResult = scorePlayer(ageAppropriatePlayer, config);

  assert.equal(oldResult.eligible, true);
  assert.equal(oldResult.confidence, 'high');
  assert.equal(oldResult.score, 31);
  assert.ok(oldResult.flags.includes('OLD_FOR_LEVEL'));

  // Age-appropriate peer should score higher
  assert.equal(peerResult.score, 50);
  assert.ok(oldResult.score < peerResult.score);
});

// ---------------------------------------------------------------------------
// Test 8 — KATOH bonus applied
// Expected: identical prospects differ only in KATOH; KATOH version scores higher
//
// Without KATOH (flag: KATOH_UNAVAILABLE):
//   age delta (19-19=0)  →   0
//   wRC+ 152 (150–159)   → +30
//   xbhPct 41 (40–44)    → +12
//   bbKRatio 0.78 (≥0.75)→ +10
//   raw 52 × 1.0 = 52 → round(52/103×100) = 50
//
// With KATOH 3.2 (≥ 3.0 → +5):
//   raw 57 × 1.0 = 57 → round(57/103×100) = 55
// ---------------------------------------------------------------------------
test('KATOH bonus — prospect with katoh 3.2 scores higher than identical prospect without', () => {
  const baseStats = {
    pa: 200, ab: 170, wrcPlus: 152, kPct: 18, bbPct: 15, bbKRatio: 0.78, xbhPct: 41,
  };

  const withKatoh = makePlayer({
    age: 19,
    level: 'A',
    position: '2B',
    stats: { ...baseStats, katoh: 3.2 },
  });

  const withoutKatoh = makePlayer({
    age: 19,
    level: 'A',
    position: '2B',
    stats: { ...baseStats },
  });

  const resultWith = scorePlayer(withKatoh, config);
  const resultWithout = scorePlayer(withoutKatoh, config);

  assert.equal(resultWith.eligible, true);
  assert.equal(resultWithout.eligible, true);
  assert.equal(resultWith.score, 55);
  assert.equal(resultWithout.score, 50);
  assert.ok(resultWith.score > resultWithout.score);
  assert.ok(!resultWith.flags.includes('KATOH_UNAVAILABLE'));
  assert.ok(resultWithout.flags.includes('KATOH_UNAVAILABLE'));
});

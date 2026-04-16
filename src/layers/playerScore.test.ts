import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePlayer, getPAConfidenceTier, getAgeVsLevelDelta, applyHardFilters } from './playerScore.js';
import { getUserConfig } from '../config.js';
import type { Player, PlayerStats } from '../types.js';

const config = getUserConfig();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<PlayerStats>): PlayerStats {
  return {
    pa: 250, ab: 215, hits: 62, doubles: 14, triples: 2, homeRuns: 9,
    strikeOuts: 44, baseOnBalls: 30,
    avg: 0.288,
    obp: 0.358, slg: 0.442, ops: 0.800,
    bbPct: 0.120, kPct: 0.176, bbKRatio: 0.682, xbhPct: 0.403, iso: 0.153,
    ...overrides,
  } as PlayerStats;
}

function makePlayer(overrides: Omit<Partial<Player>, 'stats'> & { stats?: Partial<PlayerStats> }): Player {
  const { stats, ...rest } = overrides;
  return {
    name: 'Test Player',
    playerId: 'test-001',
    age: 20,
    level: 'A+',
    org: 'Test Org',
    position: 'OF',
    isTwoWay: false,
    flags: [],
    stats: makeStats(stats ?? {}),
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Elite prospect
// Expected: eligible, high confidence, score in 85–100 range
//
// Scoring breakdown (PA 290 → high, ×1.0):
//   age delta (20-18=2)    → +20
//   OPS 0.957 ≥ 0.900      → +20
//   ISO = 0.565-74/240     →  0.257 ≥ 0.180 → +12
//   OBP 0.392 ≥ 0.380      →  +8
//   xbhPct 0.459 ≥ 0.45    → +20
//   bbKRatio 1.128 ≥ 1.0   → +15
//   raw 95 × 1.0 = 95 → round(95/98×100) = 97
// ---------------------------------------------------------------------------
test('elite prospect — young for level, elite stats, high PA', () => {
  const player = makePlayer({
    age: 18,
    level: 'A+',
    stats: {
      pa: 290, ab: 240, hits: 74, doubles: 16, triples: 3, homeRuns: 15,
      strikeOuts: 47, baseOnBalls: 53,
      obp: 0.392, slg: 0.565, ops: 0.957,
      bbPct: 0.183, kPct: 0.162, bbKRatio: 1.128, xbhPct: 0.459, iso: 0.257,
    },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'high');
  assert.ok(result.score >= 85 && result.score <= 100, `score ${result.score} not in 85–100`);
  assert.equal(result.score, 97);
  assert.ok(!result.flags.includes('OLD_FOR_LEVEL'));
});

// ---------------------------------------------------------------------------
// Test 2 — Solid watch-list prospect
// Expected: eligible, high confidence, score in 40–60 range
//
// Scoring breakdown (PA 224 → high, ×1.0):
//   age delta (21-21=0)    →   0
//   OPS 0.829 ≥ 0.825      → +14
//   ISO = 0.474-52/190     →  0.200 ≥ 0.180 → +12
//   OBP 0.355 ≥ 0.340      →  +5
//   xbhPct 0.404 ≥ 0.37    → +14
//   bbKRatio 0.791 ≥ 0.75  → +10
//   raw 55 × 1.0 = 55 → round(55/98×100) = 56
// ---------------------------------------------------------------------------
test('solid watch-list prospect — age-appropriate, decent stats, high PA', () => {
  const player = makePlayer({
    age: 21,
    level: 'AA',
    stats: {
      pa: 224, ab: 190, hits: 52, doubles: 12, triples: 1, homeRuns: 8,
      strikeOuts: 43, baseOnBalls: 34,
      obp: 0.355, slg: 0.474, ops: 0.829,
      bbPct: 0.152, kPct: 0.192, bbKRatio: 0.791, xbhPct: 0.404, iso: 0.200,
    },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'high');
  assert.ok(result.score >= 40 && result.score <= 60, `score ${result.score} not in 40–60`);
});

// ---------------------------------------------------------------------------
// Test 3 — Small sample flier
// Expected: eligible, LOW confidence, flag SMALL_SAMPLE_WATCH_ONLY
//
// Scoring breakdown (PA 134 → low, ×0.5):
//   age delta (19-17=2)    → +20
//   OPS 0.931 ≥ 0.900      → +20
//   ISO = 0.543-33/110     →  0.243 ≥ 0.180 → +12
//   OBP 0.388 ≥ 0.380      →  +8
//   xbhPct 0.424 ≥ 0.42    → +20
//   bbKRatio 0.913 ≥ 0.75  → +10
//   raw 90 × 0.5 = 45 → round(45/98×100) = 46
// ---------------------------------------------------------------------------
test('small sample flier — great profile but low PA', () => {
  const player = makePlayer({
    age: 17,
    level: 'A',
    position: 'SS',
    stats: {
      pa: 134, ab: 110, hits: 33, doubles: 7, triples: 2, homeRuns: 5,
      strikeOuts: 23, baseOnBalls: 21,
      obp: 0.388, slg: 0.543, ops: 0.931,
      bbPct: 0.157, kPct: 0.172, bbKRatio: 0.913, xbhPct: 0.424, iso: 0.243,
    },
  });

  const result = scorePlayer(player, config);

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'low');
  assert.ok(result.flags.includes('SMALL_SAMPLE_WATCH_ONLY'));
});

// ---------------------------------------------------------------------------
// Test 4 — Strikeout concern
// Expected: ineligible, flag KPCT_EXCEEDS_THRESHOLD
// kPct 0.250 > kPctMax 0.20 → hard filter triggers before any scoring
// ---------------------------------------------------------------------------
test('strikeout concern — K% exceeds hard cap', () => {
  const player = makePlayer({
    age: 22,
    level: 'AAA',
    stats: {
      pa: 248, ab: 208, hits: 64, doubles: 15, triples: 1, homeRuns: 12,
      strikeOuts: 62, baseOnBalls: 33,
      obp: 0.361, slg: 0.510, ops: 0.871,
      bbPct: 0.133, kPct: 0.250, bbKRatio: 0.532, xbhPct: 0.438, iso: 0.203,
    },
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
// Shared stats → base_raw=55 (OPS 0.844→14, ISO 0.209≥0.180→12, OBP 0.352→5,
//   xbhPct 0.415≥0.37→14, bbKRatio 0.821→10)
//
// Old player (age 24, A+, delta=20-24=-4 ≤ -2): raw=55-20=35 → score=36
// Age-appropriate (age 20, A+, delta=0):         raw=55     → score=56
// ---------------------------------------------------------------------------
test('old for level — age 24 at A+, penalized age score and flag applied', () => {
  const sharedStats = {
    pa: 220, ab: 187, hits: 53, doubles: 13, triples: 1, homeRuns: 8,
    strikeOuts: 39, baseOnBalls: 32,
    obp: 0.352, slg: 0.492, ops: 0.844,
    bbPct: 0.145, kPct: 0.177, bbKRatio: 0.821, xbhPct: 0.415, iso: 0.208,
  };

  const oldPlayer = makePlayer({ age: 24, level: 'A+', stats: sharedStats });
  const peerPlayer = makePlayer({ age: 20, level: 'A+', stats: sharedStats });

  const oldResult = scorePlayer(oldPlayer, config);
  const peerResult = scorePlayer(peerPlayer, config);

  assert.equal(oldResult.eligible, true);
  assert.equal(oldResult.confidence, 'high');
  assert.ok(oldResult.flags.includes('OLD_FOR_LEVEL'));
  assert.ok(oldResult.score < peerResult.score);
});

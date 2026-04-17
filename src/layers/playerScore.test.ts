import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePlayer, getPAConfidenceTier, getAgeVsLevelDelta, applyHardFilters } from './playerScore.js';
import { getUserConfig } from '../config.js';
import type { Player, PlayerStats, PercentileContext } from '../types.js';

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

function makeContext(overrides: Partial<PercentileContext> = {}): PercentileContext {
  return {
    isoPercentile:    0.70,
    obpPercentile:    0.70,
    opsPercentile:    0.70,
    kPctPercentile:   0.75,
    bbPctPercentile:  0.60,
    xbhPctPercentile: 0.65,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Elite prospect
// Expected: eligible, high confidence, score in 75–100 range, elite flags
//
// Scoring breakdown (PA 290 → high, ×1.0, A+ levelMult=0.90):
//   age delta (20-18=2)    → +20
//   opsPoints  0.90×12×0.90 = 9.72
//   isoPoints  0.92×12×0.90 = 9.936
//   obpPoints  0.70× 8×0.90 = 5.04
//   xbhPoints  0.88× 5×0.90 = 3.96
//   bbPoints   0.60× 3×0.90 = 1.62
//   percentile = 30.276 → min(40,30.276)
//   raw = 50.276 × 1.0 → score = round(50.276/66×100) = 76
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

  const result = scorePlayer(player, config, makeContext({ isoPercentile: 0.92, opsPercentile: 0.90, xbhPctPercentile: 0.88 }));

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'high');
  assert.ok(result.score >= 75 && result.score <= 100, `score ${result.score} not in 75–100`);
  assert.ok(result.flags.includes('ELITE_ISO_FOR_LEVEL'), 'expected ELITE_ISO_FOR_LEVEL');
  assert.ok(result.flags.includes('ELITE_OPS_FOR_LEVEL'), 'expected ELITE_OPS_FOR_LEVEL');
  assert.ok(!result.flags.includes('OLD_FOR_LEVEL'));
});

// ---------------------------------------------------------------------------
// Test 2 — Solid watch-list prospect
// Expected: eligible, high confidence, score in 35–55 range
//
// Scoring breakdown (PA 224 → high, ×1.0, AA levelMult=1.00):
//   age delta (21-21=0)    →   0
//   opsPoints  0.52×12×1.00 =  6.24
//   isoPoints  0.55×12×1.00 =  6.60
//   obpPoints  0.70× 8×1.00 =  5.60
//   xbhPoints  0.65× 5×1.00 =  3.25
//   bbPoints   0.60× 3×1.00 =  1.80
//   percentile = 23.49 → raw = 23.49 × 1.0 → score = round(23.49/66×100) = 36
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

  const result = scorePlayer(player, config, makeContext({ isoPercentile: 0.55, opsPercentile: 0.52 }));

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'high');
  assert.ok(result.score >= 35 && result.score <= 55, `score ${result.score} not in 35–55`);
});

// ---------------------------------------------------------------------------
// Test 3 — Small sample flier
// Expected: eligible, LOW confidence, flag SMALL_SAMPLE_WATCH_ONLY, score in 25–40
//
// Scoring breakdown (PA 134 → low, ×0.5, A levelMult=0.80):
//   age delta (19-17=2)    → +20
//   opsPoints  0.88×12×0.80 = 8.448
//   isoPoints  0.85×12×0.80 = 8.16
//   obpPoints  0.70× 8×0.80 = 4.48
//   xbhPoints  0.65× 5×0.80 = 2.60
//   bbPoints   0.60× 3×0.80 = 1.44
//   percentile = 25.128 → raw = 45.128 → weighted = 22.6 → score = round(22.6/66×100) = 34
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

  const result = scorePlayer(player, config, makeContext({ isoPercentile: 0.85, opsPercentile: 0.88 }));

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'low');
  assert.ok(result.flags.includes('SMALL_SAMPLE_WATCH_ONLY'));
  assert.ok(result.score >= 25 && result.score <= 40, `score ${result.score} not in 25–40`);
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

  const result = scorePlayer(player, config, makeContext());

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

  const result = scorePlayer(player, config, makeContext());

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

  const result = scorePlayer(player, config, makeContext());

  assert.equal(result.eligible, false);
  assert.equal(result.score, 0);
  assert.ok(result.flags.includes('TWO_WAY_MANUAL_REVIEW'));
  assert.ok(!result.flags.includes('PITCHER_EXCLUDED'));
});

// ---------------------------------------------------------------------------
// Test 7 — Old for level
// Expected: eligible, flag OLD_FOR_LEVEL, lower score than age-appropriate peer
//
// Both players use makeContext() defaults (iso=0.70, ops=0.70, etc.)
// Old player (age 24, A+, delta=20-24=-4 ≤ -2): age score = -20
// Age-appropriate (age 20, A+, delta=0):         age score =   0
// ---------------------------------------------------------------------------
test('old for level — age 24 at A+, penalized age score and flag applied', () => {
  const sharedStats = {
    pa: 220, ab: 187, hits: 53, doubles: 13, triples: 1, homeRuns: 8,
    strikeOuts: 39, baseOnBalls: 32,
    obp: 0.352, slg: 0.492, ops: 0.844,
    bbPct: 0.145, kPct: 0.177, bbKRatio: 0.821, xbhPct: 0.415, iso: 0.208,
  };

  const oldPlayer  = makePlayer({ age: 24, level: 'A+', stats: sharedStats });
  const peerPlayer = makePlayer({ age: 20, level: 'A+', stats: sharedStats });

  const oldResult  = scorePlayer(oldPlayer,  config, makeContext());
  const peerResult = scorePlayer(peerPlayer, config, makeContext());

  assert.equal(oldResult.eligible, true);
  assert.equal(oldResult.confidence, 'high');
  assert.ok(oldResult.flags.includes('OLD_FOR_LEVEL'));
  assert.ok(oldResult.score < peerResult.score);
});

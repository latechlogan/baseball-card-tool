import { Player, PlayerScore, UserConfig } from '../types.js';

// The maximum achievable raw score before PA weighting, used for normalization.
// Breakdown: age(20) + composite(40) + power(20) + discipline(15) + exitVelo(3) = 98
const MAX_RAW_SCORE = 98;

/**
 * Run all hard filters against a player. Returns whether the player passed and
 * any flags explaining why they were blocked. Called before any scoring.
 */
export function applyHardFilters(
  player: Player,
  config: UserConfig
): { passed: boolean; flags: string[] } {
  // Pitcher check — two-way players surface as a special case, not silently dropped
  if (player.position === 'P') {
    if (player.isTwoWay) {
      return { passed: false, flags: ['TWO_WAY_MANUAL_REVIEW'] };
    }
    return { passed: false, flags: ['PITCHER_EXCLUDED'] };
  }

  // PA minimum — below the ignore threshold, no useful sample exists
  if (player.stats.pa < config.thresholds.paConfidenceTiers.ignore) {
    return { passed: false, flags: ['INSUFFICIENT_PA'] };
  }

  // Full-season league check — Rookie ball is treated as short-season only
  if (player.level === 'R') {
    return { passed: false, flags: ['SHORT_SEASON_ONLY'] };
  }

  // K% hard cap
  if (player.stats.kPct > config.thresholds.kPctMax) {
    return { passed: false, flags: ['KPCT_EXCEEDS_THRESHOLD'] };
  }

  return { passed: true, flags: [] };
}

/**
 * Determine the PA confidence tier and the corresponding score weight multiplier.
 * Players with fewer PA receive a lower weight; very low samples are watch-list only.
 *
 * Note: players below 100 PA are filtered out by applyHardFilters before reaching here.
 */
export function getPAConfidenceTier(pa: number): {
  confidence: 'high' | 'medium' | 'low';
  multiplier: number;
} {
  if (pa >= 200) return { confidence: 'high', multiplier: 1.0 };
  if (pa >= 150) return { confidence: 'medium', multiplier: 0.75 };
  return { confidence: 'low', multiplier: 0.5 };
}

/**
 * Calculate how many years younger or older a player is relative to the
 * expected age for their level. Positive = young for level (good), negative = old.
 */
export function getAgeVsLevelDelta(player: Player, config: UserConfig): number {
  const maxAge = config.thresholds.ageVsLevelTable[player.level];
  if (maxAge === undefined) return 0;
  return maxAge - player.age;
}

/**
 * Score a player's statistical profile against the configured thresholds.
 * Returns a PlayerScore with a 0–100 normalized value, confidence level,
 * accumulated flags, and eligibility. Never throws — bad input returns ineligible.
 */
export function scorePlayer(player: Player, config: UserConfig): PlayerScore {
  // Derive ISO — slg minus batting average. ab===0 guard prevents division by zero.
  const avg = player.stats.ab > 0 ? (player.stats.hits / player.stats.ab) : 0;
  const iso = player.stats.slg - avg;

  // Step 1 — Hard Filters
  const { passed, flags: hardFilterFlags } = applyHardFilters(player, config);
  if (!passed) {
    return { score: 0, confidence: 'low', flags: hardFilterFlags, eligible: false };
  }

  const flags: string[] = [];
  let rawScore = 0;
  const t = config.thresholds;

  // Step 2 — PA Confidence Tier
  const { confidence, multiplier } = getPAConfidenceTier(player.stats.pa);
  if (player.stats.pa <= t.paConfidenceTiers.watchOnly) {
    flags.push('SMALL_SAMPLE_WATCH_ONLY');
  }

  // Step 3 — Age vs. Level Score
  const delta = getAgeVsLevelDelta(player, config);
  if (delta >= 2) {
    rawScore += 20;
  } else if (delta === 1) {
    rawScore += 10;
  } else if (delta === 0) {
    rawScore += 0;
  } else if (delta === -1) {
    rawScore -= 10;
  } else {
    rawScore -= 20;
    flags.push('OLD_FOR_LEVEL');
  }

  // Step 4 — Composite Offensive Score (OPS + ISO + OBP, max 40 pts)
  // OPS (max 20)
  if (player.stats.ops >= t.opsStrongBuy) {
    rawScore += 20;
  } else if (player.stats.ops >= t.opsModerate) {
    rawScore += 14;
  } else if (player.stats.ops >= t.opsWatch) {
    rawScore += 7;
  } else {
    flags.push('OPS_BELOW_THRESHOLD');
  }
  // ISO (max 12) — uses locally derived value (slg - avg), never mutates player
  if (iso >= t.isoStrongBuy) {
    rawScore += 12;
  } else if (iso >= t.isoModerate) {
    rawScore += 8;
  } else if (iso >= t.isoWatch) {
    rawScore += 4;
  } else {
    flags.push('ISO_BELOW_THRESHOLD');
  }
  // OBP (max 8)
  if (player.stats.obp >= t.obpStrongBuy) {
    rawScore += 8;
  } else if (player.stats.obp >= t.obpModerate) {
    rawScore += 5;
  }

  // Step 5 — Power Profile Score (XBH/H%, max 20 pts)
  const xbhPct = player.stats.xbhPct;
  if (xbhPct !== null && xbhPct >= 0.42) {
    rawScore += 20;
  } else if (xbhPct !== null && xbhPct >= 0.37) {
    rawScore += 14;
  } else if (xbhPct !== null && xbhPct >= 0.32) {
    rawScore += 8;
  } else if (xbhPct !== null && xbhPct >= 0.28) {
    rawScore += 3;
  } else {
    flags.push('WEAK_POWER_PROFILE');
  }

  // Step 6 — Plate Discipline Score (BB/K ratio)
  if (player.stats.bbKRatio >= t.bbKRatioElite) {
    rawScore += 15;
  } else if (player.stats.bbKRatio >= t.bbKRatioMin) {
    rawScore += 10;
  } else if (player.stats.bbKRatio >= t.bbKRatioLow) {
    rawScore += 5;
  } else {
    flags.push('POOR_PLATE_DISCIPLINE');
  }

  // Step 7 — Exit Velocity / Hard Contact Bonus (optional, additive)
  if (player.stats.exitVelo !== undefined) {
    if (player.stats.exitVelo >= t.exitVeloElite) {
      rawScore += 3;
    } else if (player.stats.exitVelo >= t.exitVeloMin) {
      rawScore += 1;
    }
  }
  if (player.stats.hardContactPct !== undefined) {
    if (player.stats.hardContactPct >= t.hardContactElite) {
      rawScore += 3;
    } else if (player.stats.hardContactPct >= t.hardContactMin) {
      rawScore += 1;
    }
  }

  // Step 8 — Apply PA Confidence Weight (rounded to one decimal place)
  const weightedScore = Math.round(rawScore * multiplier * 10) / 10;

  // Step 9 — Normalize to 0–100
  const score = Math.max(
    0,
    Math.min(100, Math.round((weightedScore / MAX_RAW_SCORE) * 100))
  );

  return { score, confidence, flags, eligible: true };
}

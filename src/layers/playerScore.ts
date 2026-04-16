import { Player, PlayerScore, UserConfig } from '../types.js';

// The maximum achievable raw score before PA weighting, used for normalization.
// Breakdown: age(20) + wRC+(40) + power(20) + discipline(15) + KATOH(5) + exitVelo(3) = 103
const MAX_RAW_SCORE = 103;

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

  // Step 4 — wRC+ Score
  if (player.stats.wrcPlus >= t.wrcPlusStrongBuy) {
    rawScore += 40;
  } else if (player.stats.wrcPlus >= t.wrcPlusModerate) {
    rawScore += 30;
  } else if (player.stats.wrcPlus >= t.wrcPlusWatch) {
    rawScore += 15;
  } else {
    flags.push('WRC_BELOW_THRESHOLD');
  }

  // Step 5 — Power Profile Score (XBH/H%)
  if (player.stats.xbhPct >= t.xbhPctElite) {
    rawScore += 20;
  } else if (player.stats.xbhPct >= t.xbhPctMin) {
    rawScore += 12;
  } else if (player.stats.xbhPct >= t.xbhPctLow) {
    rawScore += 6;
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

  // Step 7 — KATOH Bonus (optional signal)
  if (player.stats.katoh !== undefined) {
    if (player.stats.katoh >= t.katohElite) {
      rawScore += 5;
    } else if (player.stats.katoh >= t.katohModerate) {
      rawScore += 3;
    } else if (player.stats.katoh >= t.katohLow) {
      rawScore += 1;
    }
  } else {
    flags.push('KATOH_UNAVAILABLE');
  }

  // Step 8 — Exit Velocity / Hard Contact Bonus (optional, additive)
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

  // Step 9 — Apply PA Confidence Weight (rounded to one decimal place)
  const weightedScore = Math.round(rawScore * multiplier * 10) / 10;

  // Step 10 — Normalize to 0–100
  const score = Math.max(
    0,
    Math.min(100, Math.round((weightedScore / MAX_RAW_SCORE) * 100))
  );

  return { score, confidence, flags, eligible: true };
}

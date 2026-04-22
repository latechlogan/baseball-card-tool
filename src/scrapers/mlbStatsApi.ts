import { cache } from '../cache.js';
import { type Player, type UserConfig } from '../types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MILB_SPORT_IDS = [
  { sportId: 11, level: 'AAA' },
  { sportId: 12, level: 'AA'  },
  { sportId: 13, level: 'A+'  },
  { sportId: 14, level: 'A'   },
] as const;

type MiLBLevel = 'AAA' | 'AA' | 'A+' | 'A';

const levelPriority: Record<MiLBLevel, number> = {
  'AAA': 4, 'AA': 3, 'A+': 2, 'A': 1,
};

// ─── Error Class ──────────────────────────────────────────────────────────────

export class MLBStatsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MLBStatsApiError';
  }
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface PlayerProfile {
  id: number;
  fullName: string;
  currentAge: number;
  birthDate: string;
  positionCode: string;
  positionAbbrev: string;
  isTwoWay: boolean;
}

interface StatSplit {
  player: { id: number; fullName: string };
  team: { name: string };
  sport: { id: number };
  stat: {
    plateAppearances: number;
    atBats: number;
    hits: number;
    doubles: number;
    triples: number;
    homeRuns: number;
    strikeOuts: number;
    baseOnBalls: number;
    avg: string;
    obp: string;
    slg: string;
    ops: string;
  };
}

interface StatsApiResponse {
  stats?: Array<{ splits?: StatSplit[] }>;
}

interface RosterApiResponse {
  people?: Array<{
    id: number;
    fullName: string;
    currentAge: number;
    birthDate: string;
    primaryPosition: { code: string; abbreviation: string };
  }>;
}

// ─── URL Builders ─────────────────────────────────────────────────────────────

function statsUrl(sportId: number, season: number): string {
  return `https://statsapi.mlb.com/api/v1/stats?stats=season&season=${season}&group=hitting&gameType=R&sportId=${sportId}&limit=2000&offset=0`;
}

function rosterUrl(sportId: number, season: number): string {
  return `https://statsapi.mlb.com/api/v1/sports/${sportId}/players?season=${season}&gameType=[R]`;
}

// ─── Position Mapping ─────────────────────────────────────────────────────────

const POSITION_MAP: Record<string, Player['position']> = {
  '1': 'P',  '2': 'C',  '3': '1B', '4': '2B',
  '5': '3B', '6': 'SS', '7': 'OF', '8': 'OF',
  '9': 'OF', '10': 'DH', 'Y': 'P',
};

function mapPosition(code: string): Player['position'] {
  return POSITION_MAP[code] ?? 'OF';
}

// ─── Age Calculation ──────────────────────────────────────────────────────────

function calculateAge(birthDate: string, referenceDate?: Date): number {
  const birth = new Date(birthDate)
  const ref   = referenceDate ?? new Date()
  let age = ref.getFullYear() - birth.getFullYear()
  const monthDiff = ref.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) {
    age--
  }
  return age
}

// ─── Age Filter ───────────────────────────────────────────────────────────────

function isAgeEligible(player: Player, config: UserConfig): boolean {
  const maxAge = config.thresholds.ageVsLevelTable[player.level];
  return !!maxAge && player.age <= maxAge;
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeSplit(split: StatSplit, profile: PlayerProfile, level: MiLBLevel, referenceDate?: Date): Player | null {
  const avg  = parseFloat(split.stat.avg);
  const obp  = parseFloat(split.stat.obp);
  const slg  = parseFloat(split.stat.slg);
  const ops  = parseFloat(split.stat.ops);
  const pa   = split.stat.plateAppearances;
  const ab   = split.stat.atBats;
  const hits = split.stat.hits;
  const bb   = split.stat.baseOnBalls;
  const so   = split.stat.strikeOuts;
  const dbl  = split.stat.doubles;
  const trpl = split.stat.triples;
  const hr   = split.stat.homeRuns;

  // Data quality checks — return null without throwing
  if (pa < 50) {
    console.warn(`[mlbStatsApi] skipping ${profile.fullName} (id=${profile.id}): pa=${pa} below minimum`);
    return null;
  }

  if (isNaN(obp) || isNaN(slg) || isNaN(ops)) {
    console.warn(`[mlbStatsApi] skipping ${profile.fullName} (id=${profile.id}): STAT_PARSE_ERROR`);
    return null;
  }

  if (hits === 0 && pa > 20) {
    console.warn(`[mlbStatsApi] skipping ${profile.fullName} (id=${profile.id}): hits=0 with pa=${pa}, likely data error`);
    return null;
  }

  const flags: string[] = [];

  // Derived stats
  const bbPct    = pa > 0 ? bb / pa : 0;
  const kPct     = pa > 0 ? so / pa : 0;
  const bbKRatio = kPct > 0 ? bbPct / kPct : 0;
  const xbhPct   = hits > 0 ? (dbl + trpl + hr) / hits : null;
  const iso      = isNaN(slg) || isNaN(avg) ? 0 : slg - avg;

  if (xbhPct === null) flags.push('XBH_UNAVAILABLE');

  // Position mapping — flag unknown codes
  const position = mapPosition(profile.positionCode);
  if (!(profile.positionCode in POSITION_MAP)) {
    flags.push('POSITION_UNVERIFIED');
  }

  return {
    name:     profile.fullName,
    playerId: String(profile.id),
    age:      calculateAge(profile.birthDate, referenceDate),
    level,
    org:      split.team.name,
    position,
    isTwoWay: profile.isTwoWay,
    flags,
    stats: {
      pa, ab, hits,
      doubles: dbl, triples: trpl, homeRuns: hr,
      strikeOuts: so, baseOnBalls: bb,
      avg, obp, slg, ops,
      bbPct, kPct, bbKRatio, xbhPct, iso,
      exitVelo:       undefined,
      hardContactPct: undefined,
    },
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function fetchMiLBHitters(
  season:         number,
  config:         UserConfig,
  referenceDate?: Date
): Promise<Player[]> {
  const cacheKey = `mlb-milb-hitters-${season}`;

  try {
    const cached = cache.get<Player[]>(cacheKey, 24);
    if (cached) {
      console.log(`[cache] hit: ${cacheKey}`);
      return cached;
    }

    console.log(`[mlbStatsApi] fetching MiLB hitters: season=${season}`);

    // Step 1: Fire all 8 requests concurrently
    const requests = MILB_SPORT_IDS.flatMap(({ sportId }) => [
      fetch(statsUrl(sportId, season))
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<StatsApiResponse>;
        })
        .catch(() => {
          console.warn(`[mlbStatsApi] WARNING: failed to fetch sportId=${sportId} — results may be incomplete`);
          return null;
        }),
      fetch(rosterUrl(sportId, season))
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<RosterApiResponse>;
        })
        .catch(() => {
          console.warn(`[mlbStatsApi] WARNING: failed to fetch sportId=${sportId} roster — results may be incomplete`);
          return null;
        }),
    ]);

    const results = await Promise.all(requests);

    // Step 2: Build player profile map from all roster responses
    // Roster results are at odd indices: 1, 3, 5, 7
    const profileMap = new Map<number, PlayerProfile>();

    for (let i = 0; i < MILB_SPORT_IDS.length; i++) {
      const rosterData = results[i * 2 + 1] as RosterApiResponse | null;
      if (!rosterData?.people) continue;

      for (const person of rosterData.people) {
        if (profileMap.has(person.id)) continue; // keep first occurrence

        profileMap.set(person.id, {
          id:             person.id,
          fullName:       person.fullName,
          currentAge:     person.currentAge,
          birthDate:      person.birthDate,
          positionCode:   person.primaryPosition.code,
          positionAbbrev: person.primaryPosition.abbreviation,
          isTwoWay:       person.primaryPosition.code === 'Y',
        });
      }
    }

    // Step 3: Parse stats splits and join with profiles
    // Stats results are at even indices: 0, 2, 4, 6
    const players: Player[] = [];
    let statsFailCount = 0;

    for (let i = 0; i < MILB_SPORT_IDS.length; i++) {
      const { sportId, level } = MILB_SPORT_IDS[i];
      const statsData = results[i * 2] as StatsApiResponse | null;

      if (!statsData) {
        statsFailCount++;
        continue;
      }

      const splits: StatSplit[] = statsData.stats?.[0]?.splits ?? [];

      if (splits.length === 2000) {
        console.warn(`[mlbStatsApi] WARNING: sportId=${sportId} (${level}) returned exactly 2000 results — response may be truncated`);
      }

      for (const split of splits) {
        const profile = profileMap.get(split.player.id);
        if (!profile) {
          console.warn(`[mlbStatsApi] no profile found for player id=${split.player.id} (${split.player.fullName}), skipping`);
          continue;
        }

        const player = normalizeSplit(split, profile, level, referenceDate);
        if (player !== null) {
          players.push(player);
        }
      }
    }

    if (statsFailCount === MILB_SPORT_IDS.length) {
      throw new MLBStatsApiError('All MiLB level fetches failed.');
    }

    // Step 4: Age eligibility filter
    const beforeAge = players.length;
    const ageEligible = players.filter(p => isAgeEligible(p, config));
    const removedByAge = beforeAge - ageEligible.length;
    console.log(`[mlbStatsApi] age filter removed ${removedByAge} players above level ceiling`);

    // Step 5: Deduplicate by playerId, keeping highest-level entry
    const deduped = new Map<string, Player>();
    for (const player of ageEligible) {
      const existing = deduped.get(player.playerId);
      if (!existing || levelPriority[player.level as MiLBLevel] > levelPriority[existing.level as MiLBLevel]) {
        deduped.set(player.playerId, player);
      }
    }

    const final = Array.from(deduped.values());

    if (final.length === 0) {
      throw new MLBStatsApiError('No eligible players after filtering. Check thresholds or API response shape.');
    }

    cache.set(cacheKey, final);
    return final;

  } catch (err) {
    if (err instanceof MLBStatsApiError) throw err;
    throw new MLBStatsApiError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

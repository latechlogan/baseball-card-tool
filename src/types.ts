// Core TypeScript types for the baseball card flip tool.
// All types are exported from this file — no local type definitions in other modules.

export type MiLBLevel = 'R' | 'A' | 'A+' | 'AA' | 'AAA';

export interface PlayerStats {
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  strikeOuts: number;
  baseOnBalls: number;
  avg: number;                       // battingAverage (provided by API) — used for ISO derivation
  obp: number;                       // onBasePercentage (provided by API)
  slg: number;                       // sluggingPercentage (provided by API)
  ops: number;                       // ops (provided by API)

  // Derived fields — calculated during normalization, not from API directly
  bbPct: number;                     // baseOnBalls / pa
  kPct: number;                      // strikeOuts / pa
  bbKRatio: number;                  // bbPct / kPct
  xbhPct: number | null;             // (doubles + triples + homeRuns) / hits
  iso: number;                       // sluggingPercentage - battingAverage

  // Optional Statcast fields — unavailable from MLB Stats API for most MiLB players
  exitVelo?: number;
  hardContactPct?: number;
}

export interface Player {
  name: string;
  playerId: string;
  age: number;
  level: MiLBLevel;
  org: string;
  isTwoWay: boolean;
  position: 'C' | '1B' | '2B' | '3B' | 'SS' | 'OF' | 'DH' | 'P';
  stats: PlayerStats;
  flags: string[];                   // scraper-level flags (e.g. POSITION_UNVERIFIED)
}

export interface PlayerScore {
  score: number; // 0–100
  confidence: 'high' | 'medium' | 'low';
  flags: string[];
  eligible: boolean;
}

export interface LevelPeerGroup {
  level: string
  players: Player[]
  percentiles: {
    iso:    number[]
    obp:    number[]
    ops:    number[]
    kPct:   number[]
    bbPct:  number[]
    xbhPct: number[]
  }
}

export interface PercentileContext {
  isoPercentile:    number
  obpPercentile:    number
  opsPercentile:    number
  kPctPercentile:   number   // inverted: lower K% = higher percentile
  bbPctPercentile:  number   // 0.0 at A/A+; computed at AA/AAA
  xbhPctPercentile: number
}

export type CardType = 'chrome' | 'refractor' | 'base' | 'auto';

export interface CardTarget {
  playerName:    string;
  setName:       string;
  year:          number | null;
  parallel:      string | null;
  printRun:      number | null;
  isFirstBowman: boolean;
  cardType:      CardType;
  cardSightId:   string | null;
}

export interface CardSearchFilters {
  setName?: string;
  parallel?: string;
  year?: number;
  isAuto?: boolean;
  isFirstBowman?: boolean;
}

export interface EbaySaleRecord {
  price: number;
  date: string;
  title: string;
  condition: string;
  cardDescription: string;
}

export interface EbayComps {
  comps:                EbaySaleRecord[];
  trendDirection:       'rising' | 'flat' | 'falling';
  avgPrice:             number;
  recentAvg:            number;
  trendConfidence:      'high' | 'medium' | 'low';
  dominantParallelType: string;
  consistencyPct:       number;
}

export interface CardOpportunityScore {
  score:            number;           // 0–100
  cardFound:        boolean;
  pricingAvailable: boolean;
  cardName:         string | null;
  recommendedCard:  CardTarget | null;
  avgPrice:         number;
  recentAvg:        number;
  trendDirection:   'rising' | 'flat' | 'falling';
  trendConfidence:  'high' | 'medium' | 'low';
  roiEstimate:      number;           // multiplier: e.g. 2.1 = expect 2.1x return
  budgetFlag:       boolean;
  compCount:        number;
  flags:            string[];
}

export type TimingSignal = 'BUY_NOW' | 'WATCH' | 'AVOID';

export interface RedditPost {
  title:       string;
  subreddit:   string;
  score:       number;
  numComments: number;
  createdUtc:  number;
  url:         string;
}

export interface SentimentScore {
  score:                 number;   // 0–100 derived from chatter + trend
  chatterLevel:          'low' | 'moderate' | 'high';
  trend:                 'rising' | 'stable' | 'declining';
  timingSignal:          'BUY_NOW' | 'WATCH' | 'AVOID';
  summary:               string;
  postCount:             number;   // organic posts only
  commentCount:          number;   // organic posts only
  mechanicalMentionCount: number;  // daily threads, stats posts, sale listings
  topPosts:              RedditPost[];  // organic posts only
}

export interface CompositeScore {
  player: Player;
  playerScore: PlayerScore;
  cardScore: CardOpportunityScore;
  sentimentScore: SentimentScore;
  finalScore: number;
  timingSignal: TimingSignal;
  rankedPosition: number;
  percentileContext?: PercentileContext;
}

export interface CardMarketData {
  cardFound:        boolean;
  pricingAvailable: boolean;
  cardName:         string | null;
  cardId:           string | null;
  avgPrice:         number;
  recentAvg:        number;
  trendDirection:   'rising' | 'flat' | 'falling';
  trendConfidence:  'high' | 'medium' | 'low';
  budgetFlag:       boolean;
  compCount:        number;
  rawResponse?:     unknown;
}

export interface ScoringThresholds {
  minPA: number;
  kPctMax: number;
  // Statcast (optional bonus — Step 7)
  exitVeloElite: number;
  exitVeloMin: number;
  hardContactElite: number;
  hardContactMin: number;
  // Composite weights and tables
  playerScoreWeight: number;
  cardScoreWeight: number;
  sentimentScoreWeight: number;
  ageVsLevelTable: Record<string, number>;
  paConfidenceTiers: {
    ignore: number;
    watchOnly: number;
    reducedWeight: number;
    fullWeight: number;
  };
  parallelMultipliers: Record<string, number>;
}

export interface UserConfig {
  budgetCeiling: number;
  thresholds: ScoringThresholds;
}

export interface PipelineMeta {
  runAt:            string
  season:           number
  totalFetched:     number
  totalEligible:    number
  totalIneligible:  number
  cardsFound:       number
  pricingAvailable: number
  signals: {
    buyNow: number
    watch:  number
    avoid:  number
  }
  flagBreakdown:  Record<string, number>
  topScore:       number | null
  topPlayer:      string | null
  bottomScore:    number | null
}

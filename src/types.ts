// Core TypeScript types for the baseball card flip tool.
// All types are exported from this file — no local type definitions in other modules.

export type MiLBLevel = 'R' | 'A' | 'A+' | 'AA' | 'AAA';

export interface PlayerStats {
  pa: number;
  ab: number;
  wrcPlus: number;
  kPct: number;
  bbPct: number;
  bbKRatio: number;
  xbhPct: number;
  katoh?: number;
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
}

export interface PlayerScore {
  score: number; // 0–100
  confidence: 'high' | 'medium' | 'low';
  flags: string[];
  eligible: boolean;
}

export type CardType = 'chrome' | 'refractor' | 'base' | 'auto';

export interface CardTarget {
  playerName: string;
  setName: string;
  year: number;
  parallel: string;
  printRun?: number;
  isFirstBowman: boolean;
  cardType: CardType;
}

export interface EbaySaleRecord {
  price: number;
  date: string;
  title: string;
  condition: string;
  cardDescription: string;
}

export interface EbayComps {
  comps: EbaySaleRecord[];
  trendDirection: 'rising' | 'flat' | 'falling';
  avgPrice: number;
  recentAvg: number;
}

export interface COMCListing {
  title: string;
  askPrice: number;
  parallel: string;
  printRun?: number;
  url: string;
}

export interface CardOpportunityScore {
  score: number; // 0–100
  recommendedCard: CardTarget | null;
  roiEstimate: number;
  flags: string[];
  budgetFlag: boolean;
}

export interface SentimentScore {
  chatterLevel: 'low' | 'moderate' | 'high';
  trend: 'rising' | 'stable' | 'declining';
  timingSignal: 'BUY_NOW' | 'WATCH' | 'AVOID';
  summary: string;
}

export interface CompositeScore {
  player: Player;
  playerScore: PlayerScore;
  cardScore: CardOpportunityScore;
  sentimentScore: SentimentScore;
  finalScore: number;
  timingSignal: 'BUY_NOW' | 'WATCH' | 'AVOID';
  rankedPosition: number;
}

export interface ScoringThresholds {
  minPA: number;
  kPctMax: number;
  wrcPlusStrongBuy: number;
  wrcPlusModerate: number;
  wrcPlusWatch: number;
  xbhPctMin: number;
  xbhPctElite: number;
  xbhPctLow: number;
  bbKRatioMin: number;
  bbKRatioElite: number;
  bbKRatioLow: number;
  katohElite: number;
  katohModerate: number;
  katohLow: number;
  exitVeloElite: number;
  exitVeloMin: number;
  hardContactElite: number;
  hardContactMin: number;
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
}

export interface UserConfig {
  budgetCeiling: number;
  comcPremiumFactor: number;
  thresholds: ScoringThresholds;
}

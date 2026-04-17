import { UserConfig, ScoringThresholds } from './types.js';
import thresholdsJson from '../config/thresholds.json' with { type: 'json' };
import budgetJson from '../config/budget.json' with { type: 'json' };

const thresholds: ScoringThresholds = {
  minPA:                thresholdsJson.minPA,
  kPctMax:              thresholdsJson.kPctMax,
  exitVeloElite:        thresholdsJson.exitVeloElite,
  exitVeloMin:          thresholdsJson.exitVeloMin,
  hardContactElite:     thresholdsJson.hardContactElite,
  hardContactMin:       thresholdsJson.hardContactMin,
  playerScoreWeight:    thresholdsJson.playerScoreWeight,
  cardScoreWeight:      thresholdsJson.cardScoreWeight,
  sentimentScoreWeight: thresholdsJson.sentimentScoreWeight,
  ageVsLevelTable:      thresholdsJson.ageVsLevelTable,
  paConfidenceTiers:    thresholdsJson.paConfidenceTiers,
};

/**
 * Load and merge all config files into a single UserConfig object.
 *
 * This is the only place config files are read. All logic functions must
 * accept config as a parameter — never import config directly inside
 * scoring or scraping modules.
 */
export function getUserConfig(): UserConfig {
  return {
    budgetCeiling: budgetJson.budgetCeiling,
    comcPremiumFactor: budgetJson.comcPremiumFactor,
    thresholds,
  };
}

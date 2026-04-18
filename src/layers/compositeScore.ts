import type {
  Player, PlayerScore, CardOpportunityScore, SentimentScore,
  UserConfig, PercentileContext, CompositeScore, TimingSignal,
} from '../types.js'

function deriveTimingSignal(
  playerScore:    PlayerScore,
  cardScore:      CardOpportunityScore,
  sentimentScore: SentimentScore,
): TimingSignal {
  // Rule 1 — Hard AVOID: market fully awake; alpha eliminated regardless of other signals
  if (sentimentScore.chatterLevel === 'high' &&
      sentimentScore.trend !== 'declining') {
    return 'AVOID'
  }

  // Rule 2 — Hard AVOID: card falling with high conviction; don't buy into confirmed downtrend
  if (cardScore.trendDirection === 'falling' &&
      cardScore.trendConfidence === 'high') {
    return 'AVOID'
  }

  // Rule 3 — Hard AVOID: card exceeds budget ceiling
  if (cardScore.budgetFlag) {
    return 'AVOID'
  }

  // Rule 4 — AVOID: no card found and player score too weak to warrant manual research
  if (!cardScore.cardFound && playerScore.score < 40) {
    return 'AVOID'
  }

  // Rule 5 — BUY_NOW: all three layers aligned positively
  if (playerScore.score      >= 45 &&
      cardScore.score        >= 50 &&
      cardScore.trendDirection !== 'falling' &&
      sentimentScore.chatterLevel !== 'high') {
    return 'BUY_NOW'
  }

  // Rule 6 — BUY_NOW: sentiment opportunity with decent player score; market asleep
  if (sentimentScore.timingSignal === 'BUY_NOW' &&
      playerScore.score >= 35 &&
      cardScore.trendDirection !== 'falling') {
    return 'BUY_NOW'
  }

  // Rule 7 — BUY_NOW: card momentum not yet reflected in community awareness
  if (cardScore.trendDirection  === 'rising' &&
      cardScore.trendConfidence !== 'low' &&
      sentimentScore.chatterLevel === 'low' &&
      playerScore.score >= 30) {
    return 'BUY_NOW'
  }

  return 'WATCH'
}

export function buildCompositeScore(
  player:         Player,
  playerScore:    PlayerScore,
  cardScore:      CardOpportunityScore,
  sentimentScore: SentimentScore,
  config:         UserConfig,
  rank:           number,
  context:        PercentileContext,
): CompositeScore {
  const weights = {
    player:    config.thresholds.playerScoreWeight,    // 0.50
    card:      config.thresholds.cardScoreWeight,      // 0.30
    sentiment: config.thresholds.sentimentScoreWeight, // 0.20
  }

  const weightedScore =
    (playerScore.score    * weights.player) +
    (cardScore.score      * weights.card)   +
    (sentimentScore.score * weights.sentiment)

  const totalWeight = weights.player + weights.card + weights.sentiment
  const finalScore  = Math.round(weightedScore / totalWeight)

  const timingSignal = deriveTimingSignal(playerScore, cardScore, sentimentScore)

  return {
    player,
    playerScore,
    cardScore,
    sentimentScore,
    finalScore,
    timingSignal,
    rankedPosition: rank,
    percentileContext: context,
  }
}

import type { CardMarketData, PlayerScore, CardOpportunityScore, UserConfig, CardTarget } from '../types.js'

function estimateROI(
  trendDirection: string,
  trendConfidence: string,
  playerScore: number,
): number {
  const baseROI: Record<string, number> = {
    rising:  2.5,
    flat:    1.3,
    falling: 0.8,
  }

  const confidenceAdj: Record<string, number> = {
    high:   1.0,
    medium: 0.85,
    low:    0.70,
  }

  const playerAdj = 0.8 + (playerScore / 100) * 0.6

  return Math.round(
    baseROI[trendDirection] *
    confidenceAdj[trendConfidence] *
    playerAdj * 10,
  ) / 10
}

export function scoreCard(
  marketData: CardMarketData,
  playerScore: PlayerScore,
  config: UserConfig,
  playerName: string = '',
): CardOpportunityScore {
  if (!marketData.cardFound) {
    return {
      score:            0,
      cardFound:        false,
      pricingAvailable: false,
      cardName:         null,
      recommendedCard:  null,
      avgPrice:         0,
      recentAvg:        0,
      trendDirection:   'flat',
      trendConfidence:  'low',
      roiEstimate:      0,
      budgetFlag:       false,
      flags:            ['CARD_NOT_FOUND'],
    }
  }

  if (!marketData.pricingAvailable) {
    return {
      score:            25,
      cardFound:        true,
      pricingAvailable: false,
      cardName:         marketData.cardName,
      recommendedCard:  null,
      avgPrice:         0,
      recentAvg:        0,
      trendDirection:   'flat',
      trendConfidence:  'low',
      roiEstimate:      0,
      budgetFlag:       false,
      flags:            ['PRICING_UNAVAILABLE'],
    }
  }

  const flags: string[] = []

  // Trend score (max 40 points)
  const trendPoints = {
    rising:  40,
    flat:    20,
    falling: 0,
  }[marketData.trendDirection]

  const confidenceMultiplier = {
    high:   1.0,
    medium: 0.7,
    low:    0.4,
  }[marketData.trendConfidence]

  const trendScore = Math.round(trendPoints * confidenceMultiplier)

  if (marketData.trendDirection === 'rising') flags.push('TREND_RISING')
  if (marketData.trendDirection === 'falling' && marketData.trendConfidence === 'high') flags.push('TREND_FALLING')
  if (marketData.trendConfidence === 'low') flags.push('LOW_CONFIDENCE_TREND')

  // Price accessibility score (max 35 points)
  const ceiling = config.budgetCeiling
  const price   = marketData.recentAvg
  let priceScore: number

  if (price <= 0) {
    priceScore = 0
    flags.push('NO_PRICE_DATA')
  } else if (price > ceiling) {
    priceScore = 0
    flags.push('EXCEEDS_BUDGET')
  } else {
    const affordabilityRatio = 1 - (price / ceiling)
    priceScore = Math.round(affordabilityRatio * 35)
  }

  // Player score alignment bonus (max 25 points)
  const alignmentScore = Math.round((playerScore.score / 100) * 25)

  const finalScore = Math.min(100, Math.round(trendScore + priceScore + alignmentScore))

  const roiEstimate = estimateROI(
    marketData.trendDirection,
    marketData.trendConfidence,
    playerScore.score,
  )

  const recommendedCard: CardTarget = {
    playerName,
    setName:       marketData.cardName ?? 'Bowman Chrome',
    year:          null,
    parallel:      null,
    printRun:      null,
    isFirstBowman: true,
    cardType:      'refractor',
    cardSightId:   marketData.cardId,
  }

  return {
    score:            finalScore,
    cardFound:        true,
    pricingAvailable: true,
    cardName:         marketData.cardName,
    recommendedCard,
    avgPrice:         marketData.avgPrice,
    recentAvg:        marketData.recentAvg,
    trendDirection:   marketData.trendDirection,
    trendConfidence:  marketData.trendConfidence,
    roiEstimate,
    budgetFlag:       marketData.budgetFlag,
    flags,
  }
}

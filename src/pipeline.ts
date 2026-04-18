import { writeFileSync, mkdirSync } from 'fs'
import { getUserConfig } from './config.js'
import { fetchMiLBHitters } from './scrapers/mlbStatsApi.js'
import { scorePlayer } from './layers/playerScore.js'
import { buildPeerGroups, getPercentileContext } from './layers/peerGroups.js'
import { fetchCardMarketData } from './scrapers/cardSight.js'
import { scoreCard } from './layers/cardScore.js'
import { cache } from './cache.js'
import type {
  UserConfig, Player, PlayerScore, CardOpportunityScore,
  CompositeScore, PercentileContext, TimingSignal,
} from './types.js'

// Parse season from CLI args: npm run pipeline -- --season 2025
// Falls back to current year if not provided
function parseSeason(): number {
  const idx = process.argv.indexOf('--season')
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = parseInt(process.argv[idx + 1], 10)
    if (!isNaN(parsed) && parsed >= 2010 && parsed <= new Date().getFullYear()) {
      return parsed
    }
    console.warn(`[pipeline] invalid --season value, falling back to current year`)
  }
  return new Date().getFullYear()
}

const SEASON = parseSeason()
console.log(`[pipeline] season: ${SEASON}`)

const forceFresh = process.argv.includes('--fresh')
if (forceFresh) {
  cache.invalidate(`mlb-milb-hitters-${SEASON}`)
  console.log('[pipeline] cache invalidated — forcing fresh fetch')
}

function buildPartialComposite(
  player: Player,
  playerScore: PlayerScore,
  cardScore: CardOpportunityScore,
  config: UserConfig,
  rank: number,
  context: PercentileContext,
): CompositeScore {
  const twoLayerScore = Math.round(
    (playerScore.score * config.thresholds.playerScoreWeight +
     cardScore.score   * config.thresholds.cardScoreWeight) /
    (config.thresholds.playerScoreWeight + config.thresholds.cardScoreWeight),
  )

  const timingSignal: TimingSignal =
    cardScore.flags.includes('CARD_NOT_FOUND')                            ? 'WATCH'    :
    cardScore.flags.includes('EXCEEDS_BUDGET')                            ? 'WATCH'    :
    cardScore.flags.includes('TREND_FALLING') &&
    cardScore.trendConfidence === 'high'                                  ? 'AVOID'    :
    cardScore.score >= 60 && playerScore.score >= 50                      ? 'BUY_NOW'  :
    'WATCH'

  return {
    player,
    playerScore,
    cardScore,
    sentimentScore: {
      chatterLevel: 'low',
      trend: 'stable',
      timingSignal: 'WATCH',
      summary: 'Sentiment scoring not yet implemented.',
    },
    finalScore: twoLayerScore,
    timingSignal,
    rankedPosition: rank,
    percentileContext: context,
  }
}

export async function runPipeline(config: UserConfig): Promise<CompositeScore[]> {
  const startTime = Date.now()

  // Step 1 — Fetch
  console.log('[pipeline] fetching MiLB hitters...')
  const players = await fetchMiLBHitters(SEASON, config)
  console.log(`[pipeline] ${players.length} age-eligible players fetched`)

  // Step 2a — Build peer groups from full player pool
  const peerGroups = buildPeerGroups(players)
  console.log('[pipeline] peer groups built:',
    peerGroups.map(g => `${g.level}: ${g.players.length} peers`).join(' | '))

  // Step 2b — Score each player using their peer context
  const scoredPlayers = players.map(player => {
    const context = getPercentileContext(player, peerGroups)
    return { player, playerScore: scorePlayer(player, config, context), context }
  })

  const eligible   = scoredPlayers.filter(p => p.playerScore.eligible)
  const ineligible = scoredPlayers.filter(p => !p.playerScore.eligible)

  console.log(`[pipeline] ${eligible.length} eligible / ${ineligible.length} ineligible after scoring`)

  const flagCounts = ineligible.reduce((acc, p) => {
    p.playerScore.flags.forEach(f => {
      acc[f] = (acc[f] ?? 0) + 1
    })
    return acc
  }, {} as Record<string, number>)
  console.log('[pipeline] ineligible flag breakdown:', flagCounts)

  // Step 3 — Fetch card market data (eligible players only, sequential with delay)
  console.log('[pipeline] fetching card market data for eligible players...')

  const eligibleWithCards: Array<{
    player: Player
    playerScore: PlayerScore
    context: PercentileContext
    marketData: Awaited<ReturnType<typeof fetchCardMarketData>>
    cardScore: CardOpportunityScore
  }> = []

  for (const scored of eligible) {
    const marketData = await fetchCardMarketData(scored.player.name, config)
    const cardScore  = scoreCard(marketData, scored.playerScore, config, scored.player.name)
    eligibleWithCards.push({ ...scored, marketData, cardScore })
    await new Promise(resolve => setTimeout(resolve, 350))
  }

  console.log(
    `[pipeline] card market data complete — ` +
    `${eligibleWithCards.filter(p => p.marketData.cardFound).length} cards found, ` +
    `${eligibleWithCards.filter(p => p.marketData.pricingAvailable).length} with pricing`,
  )

  // Step 4 — Build composites sorted by two-layer score
  const composites: CompositeScore[] = eligibleWithCards
    .map(p => buildPartialComposite(p.player, p.playerScore, p.cardScore, config, 0, p.context))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((c, i) => ({ ...c, rankedPosition: i + 1 }))

  // Step 5 — Write output files
  mkdirSync('./data/output', { recursive: true })

  writeFileSync(
    './data/output/scored-prospects.json',
    JSON.stringify(composites, null, 2),
  )
  console.log(`[pipeline] wrote ${composites.length} prospects to data/output/scored-prospects.json`)

  const meta = {
    runAt:           new Date().toISOString(),
    season:          SEASON,
    totalFetched:    players.length,
    totalEligible:   eligible.length,
    totalIneligible: ineligible.length,
    flagBreakdown:   flagCounts,
    topScore:        composites[0]?.finalScore ?? null,
    bottomScore:     composites[composites.length - 1]?.finalScore ?? null,
  }
  writeFileSync('./data/output/pipeline-meta.json', JSON.stringify(meta, null, 2))

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Step 6 — Console summary
  console.log('\n═══════════════════════════════════════')
  console.log('  PROSPECT PIPELINE — TOP 10 RESULTS   ')
  console.log('═══════════════════════════════════════\n')

  composites.slice(0, 10).forEach(c => {
    const p  = c.player
    const ps = c.playerScore
    const cs = c.cardScore
    const st = p.stats

    console.log(`#${c.rankedPosition} ${p.name} (${p.org} — ${p.level}) | Age: ${p.age}`)
    console.log(
      `   Player: ${ps.score} | Card: ${cs.score} | Signal: ${c.timingSignal}`,
    )
    console.log(
      `   OPS: ${st.ops.toFixed(3)} | ISO: ${st.iso.toFixed(3)}` +
      ` | K%: ${(st.kPct * 100).toFixed(1)}%` +
      ` | PA: ${st.pa}`,
    )

    if (cs.cardFound) {
      const priceDisplay = cs.pricingAvailable ? `$${cs.recentAvg.toFixed(2)} avg` : 'N/A'
      console.log(
        `   💳 ${cs.cardName ?? 'Bowman Chrome 1st'}` +
        ` | ${priceDisplay}` +
        ` | ${cs.trendDirection} (${cs.trendConfidence})` +
        ` | Est. ROI: ${cs.roiEstimate}x`,
      )
      if (cs.budgetFlag) console.log(`   ⚠️  EXCEEDS BUDGET CEILING`)
    } else {
      console.log(`   💳 No card found in CardSight catalog`)
    }

    const gemFlags = ps.flags.filter(f =>
      f.startsWith('ELITE_') || f === 'MULTI_TOOL_PROFILE',
    )
    if (gemFlags.length) console.log(`   ⭐ ${gemFlags.join(', ')}`)
    console.log()
  })

  console.log(
    `Signal: ${composites.length} prospects scored | ` +
    `Run: ${new Date().toLocaleString()} | ` +
    `Elapsed: ${elapsed}s`,
  )

  return composites
}

const config = getUserConfig()
runPipeline(config).catch(err => {
  console.error('[pipeline] fatal error:', err.message)
  process.exit(1)
})

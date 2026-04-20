import { writeFileSync, mkdirSync } from 'fs'
import { getUserConfig } from './config.js'
import { fetchMiLBHitters } from './scrapers/mlbStatsApi.js'
import { scorePlayer } from './layers/playerScore.js'
import { buildPeerGroups, getPercentileContext } from './layers/peerGroups.js'
import { fetchCardMarketData } from './scrapers/cardSight.js'
import { scoreCard } from './layers/cardScore.js'
import { fetchRedditSentiment, getNeutralSentiment } from './scrapers/reddit.js'
import { buildCompositeScore } from './layers/compositeScore.js'
import { cache } from './cache.js'
import { generateBuyList } from './output/buyList.js'
import type {
  UserConfig, Player, PlayerScore, CardOpportunityScore, CompositeScore, PercentileContext, PipelineMeta,
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

const skipSentiment = process.argv.includes('--skip-sentiment')
const forceFresh    = process.argv.includes('--fresh')
if (forceFresh) {
  cache.invalidate(`mlb-milb-hitters-${SEASON}`)
  console.log('[pipeline] cache invalidated — forcing fresh fetch')
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

  // Step 4 — Fetch sentiment (eligible players only, sequential)
  console.log('[pipeline] fetching Reddit sentiment...')

  const fullyScored = []
  for (const p of eligibleWithCards) {
    const sentimentScore = skipSentiment
      ? getNeutralSentiment()
      : await fetchRedditSentiment(p.player.name, config)
    fullyScored.push({ ...p, sentimentScore })
    if (!skipSentiment) await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('[pipeline] sentiment complete')

  // Step 5 — Build composites sorted by final score
  const composites: CompositeScore[] = fullyScored
    .map(p => buildCompositeScore(
      p.player,
      p.playerScore,
      p.cardScore,
      p.sentimentScore,
      config,
      0,        // rank assigned after sort
      p.context,
    ))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((c, i) => ({ ...c, rankedPosition: i + 1 }))

  // Step 6 — Write output files
  mkdirSync('./data/output', { recursive: true })

  writeFileSync(
    './data/output/scored-prospects.json',
    JSON.stringify(composites, null, 2),
  )
  console.log(`[pipeline] wrote ${composites.length} prospects to data/output/scored-prospects.json`)

  const buyNow = composites.filter(c => c.timingSignal === 'BUY_NOW')
  const avoid  = composites.filter(c => c.timingSignal === 'AVOID')

  const meta: PipelineMeta = {
    runAt:            new Date().toISOString(),
    season:           SEASON,
    totalFetched:     players.length,
    totalEligible:    eligible.length,
    totalIneligible:  ineligible.length,
    cardsFound:       eligibleWithCards.filter(p => p.cardScore.cardFound).length,
    pricingAvailable: eligibleWithCards.filter(p => p.cardScore.pricingAvailable).length,
    signals: {
      buyNow: buyNow.length,
      watch:  composites.length - buyNow.length - avoid.length,
      avoid:  avoid.length,
    },
    flagBreakdown:  flagCounts,
    topScore:       composites[0]?.finalScore ?? null,
    topPlayer:      composites[0]?.player.name ?? null,
    bottomScore:    composites[composites.length - 1]?.finalScore ?? null,
  }
  writeFileSync('./data/output/pipeline-meta.json', JSON.stringify(meta, null, 2))

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Step 7 — Console summary
  console.log('\n' + '═'.repeat(55))
  console.log('  BASEBALL CARD FLIP TOOL — FINAL RANKED OUTPUT')
  console.log('═'.repeat(55) + '\n')

  composites.slice(0, 10).forEach(c => {
    const p  = c.player
    const ps = c.playerScore
    const cs = c.cardScore
    const ss = c.sentimentScore
    const st = p.stats

    const signalEmoji = {
      BUY_NOW: '🟢',
      WATCH:   '🟡',
      AVOID:   '🔴',
    }[c.timingSignal]

    console.log(
      `${signalEmoji} #${c.rankedPosition} ${p.name}` +
      ` (${p.org} — ${p.level}) | Age: ${p.age}`
    )
    console.log(
      `   Score: ${c.finalScore} | Player: ${ps.score}` +
      ` | Card: ${cs.score} | Sentiment: ${ss.score}`
    )
    console.log(
      `   OPS: ${st.ops.toFixed(3)} | ISO: ${st.iso.toFixed(3)}` +
      ` | K%: ${(st.kPct * 100).toFixed(1)}% | PA: ${st.pa}`
    )

    if (cs.cardFound) {
      console.log(
        `   💳 ${cs.cardName ?? 'Bowman Chrome 1st'}` +
        ` | $${cs.recentAvg.toFixed(2)}` +
        ` | ${cs.trendDirection} (${cs.trendConfidence})` +
        ` | ROI est: ${cs.roiEstimate}x`
      )
    } else {
      console.log(`   💳 No card found in catalog`)
    }

    console.log(
      `   💬 ${ss.chatterLevel} chatter | ${ss.trend}` +
      ` | ${ss.postCount} posts / ${ss.mechanicalMentionCount} mechanical`
    )

    if (ss.summary && ss.summary !== 'Sentiment summary unavailable.') {
      console.log(`   "${ss.summary}"`)
    }

    const gemFlags = ps.flags.filter(f =>
      f.startsWith('ELITE_') || f === 'MULTI_TOOL_PROFILE',
    )
    if (gemFlags.length) console.log(`   ⭐ ${gemFlags.join(', ')}`)

    console.log()
  })

  console.log('─'.repeat(55))
  console.log(`🟢 BUY NOW: ${buyNow.length} | 🟡 WATCH: ${composites.length - buyNow.length - avoid.length} | 🔴 AVOID: ${avoid.length}`)
  console.log(`Run: ${new Date().toLocaleString()} | Season: ${SEASON}`)
  console.log(`Elapsed: ${elapsed}s`)

  await generateBuyList(composites, meta, config)
  console.log('[pipeline] buy list written to data/output/buy-list.md')

  return composites
}

const config = getUserConfig()
runPipeline(config).catch(err => {
  console.error('[pipeline] fatal error:', err.message)
  process.exit(1)
})

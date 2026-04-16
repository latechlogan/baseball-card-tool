import { writeFileSync, mkdirSync } from 'fs'
import { getUserConfig } from './config.js'
import { fetchMiLBHitters } from './scrapers/mlbStatsApi.js'
import { scorePlayer } from './layers/playerScore.js'
import { cache } from './cache.js'
import type { UserConfig, Player, PlayerScore, CompositeScore } from './types.js'

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
  config: UserConfig,
  rank: number
): CompositeScore {
  return {
    player,
    playerScore,
    cardScore: {
      score: 0,
      recommendedCard: null,
      roiEstimate: 0,
      flags: ['CARD_SCORE_NOT_YET_IMPLEMENTED'],
      budgetFlag: false,
    },
    sentimentScore: {
      chatterLevel: 'low',
      trend: 'stable',
      timingSignal: 'WATCH',
      summary: 'Sentiment scoring not yet implemented.',
    },
    finalScore: playerScore.score,
    timingSignal: 'WATCH',
    rankedPosition: rank,
  }
}

export async function runPipeline(config: UserConfig): Promise<CompositeScore[]> {
  // Step 1 — Fetch
  console.log('[pipeline] fetching MiLB hitters...')
  const players = await fetchMiLBHitters(SEASON, config)
  console.log(`[pipeline] ${players.length} age-eligible players fetched`)

  // Step 2 — Score
  const scoredPlayers = players.map(player => ({
    player,
    playerScore: scorePlayer(player, config),
  }))

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

  // Step 3 — Build composite scores
  const sorted = [...eligible].sort((a, b) => b.playerScore.score - a.playerScore.score)

  const composites: CompositeScore[] = sorted.map(({ player, playerScore }, i) =>
    buildPartialComposite(player, playerScore, config, i + 1)
  )

  // Step 4 — Write output files
  mkdirSync('./data/output', { recursive: true })

  writeFileSync(
    './data/output/scored-prospects.json',
    JSON.stringify(composites, null, 2)
  )
  console.log(`[pipeline] wrote ${composites.length} prospects to data/output/scored-prospects.json`)

  const meta = {
    runAt:           new Date().toISOString(),
    season:          SEASON,
    totalFetched:    players.length,
    totalEligible:   eligible.length,
    totalIneligible: ineligible.length,
    flagBreakdown:   flagCounts,
    topScore:        composites[0]?.playerScore.score ?? null,
    bottomScore:     composites[composites.length - 1]?.playerScore.score ?? null,
  }
  writeFileSync('./data/output/pipeline-meta.json', JSON.stringify(meta, null, 2))

  // Step 5 — Console summary
  console.log('\n═══════════════════════════════════════')
  console.log('  PROSPECT PIPELINE — TOP 10 RESULTS   ')
  console.log('═══════════════════════════════════════\n')

  composites.slice(0, 10).forEach(c => {
    const p = c.player
    const s = c.playerScore
    const st = p.stats

    console.log(`#${c.rankedPosition} ${p.name} (${p.org} — ${p.level}) | Age: ${p.age}`)
    console.log(
      `   Score: ${s.score} | Confidence: ${s.confidence}` +
      ` | OPS: ${st.ops.toFixed(3)} | ISO: ${st.iso.toFixed(3)}` +
      ` | OBP: ${st.obp.toFixed(3)} | K%: ${(st.kPct * 100).toFixed(1)}%` +
      ` | BB/K: ${st.bbKRatio.toFixed(2)} | PA: ${st.pa}`
    )
    if (s.flags.length) console.log(`   Flags: ${s.flags.join(', ')}`)
    console.log()
  })

  console.log(`Signal: ${composites.length} prospects scored | Run: ${new Date().toLocaleString()}`)

  return composites
}

const config = getUserConfig()
runPipeline(config).catch(err => {
  console.error('[pipeline] fatal error:', err.message)
  process.exit(1)
})

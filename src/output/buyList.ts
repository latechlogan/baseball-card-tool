import { readFileSync, writeFileSync } from 'fs'
import { getUserConfig } from '../config.js'
import type { CompositeScore, PipelineMeta, UserConfig, TimingSignal } from '../types.js'

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatPrice(price: number): string {
  return price > 0 ? `$${price.toFixed(2)}` : 'N/A'
}

function formatPct(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`
}

function signalEmoji(signal: TimingSignal): string {
  return { BUY_NOW: '🟢', WATCH: '🟡', AVOID: '🔴' }[signal]
}

function confidenceLabel(confidence: string): string {
  return ({ high: '🔵 High', medium: '🟡 Medium', low: '⚪ Low' } as Record<string, string>)[confidence] ?? confidence
}

function awarenessLabel(level: string): string {
  return ({
    unknown:    '👻 Unknown to hobby',
    emerging:   '👀 Emerging awareness',
    well_known: '📢 Well known',
    peak_hype:  '🔥 Peak hype',
  } as Record<string, string>)[level] ?? level
}

export function generateRationale(composite: CompositeScore): string {
  const { playerScore, cardScore, sentimentScore, timingSignal } = composite

  if (timingSignal === 'BUY_NOW') {
    if ((sentimentScore.awarenessLevel === 'unknown' || sentimentScore.awarenessLevel === 'emerging') && cardScore.trendDirection === 'rising') {
      return 'Market is asleep on a rising card — classic pre-breakout entry window.'
    }
    if ((sentimentScore.awarenessLevel === 'unknown' || sentimentScore.awarenessLevel === 'emerging') && cardScore.trendDirection === 'flat') {
      return 'Low hobby awareness with stable card pricing — patient entry opportunity.'
    }
    return 'Strong multi-layer alignment across player quality, card market, and sentiment.'
  }

  if (timingSignal === 'AVOID') {
    if (cardScore.trendDirection === 'falling' && cardScore.trendConfidence === 'high') {
      return 'Card market actively repricing downward with high confidence — wait for the floor.'
    }
    if (cardScore.budgetFlag) {
      return 'Target card exceeds current budget ceiling — flag for when capital increases.'
    }
    if (!cardScore.cardFound && playerScore.score < 40) {
      return 'No card found in catalog and player analytics are insufficient to justify a manual search.'
    }
    if (sentimentScore.awarenessLevel === 'peak_hype' || sentimentScore.awarenessLevel === 'well_known') {
      return 'Hobby community is already fully aware — alpha has been priced in.'
    }
    return 'Risk factors outweigh opportunity across the three scoring layers.'
  }

  // WATCH
  if (!cardScore.cardFound) {
    return `Strong player profile but no card found — verify manually and revisit if a Bowman Chrome 1st is located.`
  }
  if (cardScore.trendDirection === 'falling') {
    return `Card market declining — monitor for price floor before entering.`
  }
  if (cardScore.trendConfidence === 'low') {
    return `Insufficient comp volume for confident trend signal — revisit when more sales data accumulates.`
  }
  if (playerScore.score < 35) {
    return composite.player.stats.pa >= 400
      ? `Card opportunity is solid but player analytics rank below threshold — review scouting context before buying.`
      : `Card opportunity looks decent but player analytics need strengthening — higher PA sample would help.`
  }
  if (sentimentScore.awarenessLevel === 'emerging') {
    return `Hobby awareness is building — window may be narrowing, monitor chatter trend closely.`
  }
  return `No single layer is strong enough to trigger a buy — check back as season data accumulates.`
}

function renderFullEntry(c: CompositeScore): string {
  const p  = c.player
  const ps = c.playerScore
  const cs = c.cardScore
  const ss = c.sentimentScore
  const st = p.stats

  const gemFlags = ps.flags.filter(f => f.startsWith('ELITE_') || f === 'MULTI_TOOL_PROFILE')

  const cardLine = cs.cardFound
    ? cs.cardName ?? 'Bowman Chrome 1st'
    : 'Not found in CardSight catalog'

  const priceLine = cs.pricingAvailable
    ? `${formatPrice(cs.recentAvg)} avg (based on ${cs.compCount} comps)`
    : 'N/A'

  const budgetDisplay = cs.pricingAvailable
    ? (cs.budgetFlag ? `⚠️ Exceeds ceiling` : `✅ Within ceiling`)
    : 'N/A'

  const summaryLine = ss.reasoning && ss.reasoning !== 'Sentiment data unavailable.'
    ? `- ${ss.reasoning}\n`
    : ''

  const eliteFlagsLine = gemFlags.length > 0
    ? `**Elite flags:** ${gemFlags.join(' · ')}\n\n`
    : ''

  return [
    `### #${c.rankedPosition} ${p.name}`,
    `**${p.org} — ${p.level}** | Age ${p.age} | ${signalEmoji(c.timingSignal)} ${c.timingSignal.replace('_', ' ')}`,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Final Score | ${c.finalScore} |`,
    `| Player Score | ${ps.score} |`,
    `| PA | ${st.pa} |`,
    `| Card Score | ${cs.score} |`,
    `| Sentiment Score | ${ss.score} |`,
    '',
    `**Stats:** OPS ${st.ops.toFixed(3)} | ISO ${st.iso.toFixed(3)} | K% ${formatPct(st.kPct)} | BB/K ${st.bbKRatio.toFixed(2)} | PA ${st.pa}`,
    '',
    eliteFlagsLine.trimEnd(),
    '**Card Target**',
    `- **Card:** ${cardLine}`,
    `- **Price:** ${priceLine}`,
    `- **Trend:** ${cs.trendDirection} (${confidenceLabel(cs.trendConfidence)} confidence)`,
    `- **Est. ROI:** ${cs.roiEstimate}x`,
    `- **Budget:** ${budgetDisplay}`,
    '',
    '**Sentiment**',
    `- **Awareness:** ${awarenessLabel(ss.awarenessLevel)} | **Confidence:** ${ss.confidence}`,
    summaryLine.trimEnd(),
    `**Why ${c.timingSignal.replace('_', ' ')}:**`,
    generateRationale(c),
    '',
    '---',
    '',
  ].filter(line => line !== '').join('\n')
}

function renderCondensedEntry(c: CompositeScore): string {
  const p  = c.player
  const cs = c.cardScore

  return [
    `### #${c.rankedPosition} ${p.name} 🔴 AVOID`,
    `**${p.org} — ${p.level}** | Age ${p.age}`,
    '',
    generateRationale(c),
    '',
    `*(Card: ${cs.cardName ?? 'not found'} | Price: ${formatPrice(cs.recentAvg)} | Trend: ${cs.trendDirection})*`,
    '',
    '---',
    '',
  ].join('\n')
}

function renderPipelineNotes(meta: PipelineMeta, config: UserConfig): string {
  const flagLines = Object.entries(meta.flagBreakdown)
    .map(([flag, count]) => `- ${flag}: ${count}`)
    .join('\n')

  const cardsNotFound = meta.totalEligible - meta.cardsFound
  const nopricing     = meta.cardsFound - meta.pricingAvailable

  return [
    '## Pipeline Notes',
    '',
    `**Ineligible players removed:** ${meta.totalIneligible}`,
    flagLines || '- (none)',
    '',
    '**Data quality flags this run:**',
    `- Cards not found in CardSight catalog: ${cardsNotFound}`,
    `- Players with no pricing data: ${nopricing}`,
    '',
    `**Budget ceiling:** $${config.budgetCeiling} | **Season:** ${meta.season}`,
    '',
    '---',
    '',
  ].join('\n')
}

export async function generateBuyList(
  composites: CompositeScore[],
  meta:        PipelineMeta,
  config:      UserConfig,
): Promise<void> {
  const buyNow = composites.filter(c => c.timingSignal === 'BUY_NOW')
  const watch  = composites.filter(c => c.timingSignal === 'WATCH')
  const avoid  = composites.filter(c => c.timingSignal === 'AVOID')

  const headerLine =
    `**Pipeline:** ${meta.totalFetched} fetched → ${meta.totalEligible} eligible → ` +
    `${meta.signals.buyNow} 🟢 BUY NOW / ${meta.signals.watch} 🟡 WATCH / ${meta.signals.avoid} 🔴 AVOID`

  const buyNowSection = [
    `## 🟢 BUY NOW (${buyNow.length})`,
    '',
    buyNow.length > 0
      ? buyNow.map(renderFullEntry).join('\n')
      : 'No BUY NOW signals this run.',
    '',
    '---',
    '',
  ].join('\n')

  const watchSection = [
    `## 🟡 WATCH (${watch.length})`,
    '',
    watch.map(renderFullEntry).join('\n'),
    '---',
    '',
  ].join('\n')

  const avoidSection = [
    `## 🔴 AVOID (${avoid.length})`,
    '',
    avoid.map(renderCondensedEntry).join('\n'),
    '---',
    '',
  ].join('\n')

  const markdown = [
    '# Baseball Card Flip Tool — Buy List',
    `**Season:** ${meta.season} | **Generated:** ${formatDate(meta.runAt)}`,
    headerLine,
    '',
    '---',
    '',
    buyNowSection,
    watchSection,
    avoidSection,
    renderPipelineNotes(meta, config),
    '*Generated by baseball-card-tool | Data sources: MLB Stats API, CardSight AI, Claude Web Search*',
    '',
  ].join('\n')

  writeFileSync('./data/output/buy-list.md', markdown)

  const buyListJson = {
    generatedAt:   meta.runAt,
    season:        meta.season,
    budgetCeiling: config.budgetCeiling,
    summary: {
      totalEligible: composites.length,
      buyNow:  buyNow.length,
      watch:   watch.length,
      avoid:   avoid.length,
    },
    prospects: composites.map(c => ({
      rank:           c.rankedPosition,
      name:           c.player.name,
      org:            c.player.org,
      level:          c.player.level,
      age:            c.player.age,
      signal:         c.timingSignal,
      finalScore:     c.finalScore,
      playerScore:    c.playerScore.score,
      cardScore:      c.cardScore.score,
      sentimentScore: c.sentimentScore.score,
      stats: {
        ops:      c.player.stats.ops,
        iso:      c.player.stats.iso,
        kPct:     c.player.stats.kPct,
        bbKRatio: c.player.stats.bbKRatio,
        pa:       c.player.stats.pa,
      },
      card: {
        found:       c.cardScore.cardFound,
        name:        c.cardScore.cardName,
        recentAvg:   c.cardScore.recentAvg,
        trend:       c.cardScore.trendDirection,
        confidence:  c.cardScore.trendConfidence,
        roiEstimate: c.cardScore.roiEstimate,
        budgetFlag:  c.cardScore.budgetFlag,
        compCount:   c.cardScore.compCount,
      },
      sentiment: {
        awarenessLevel: c.sentimentScore.awarenessLevel,
        timingSignal:   c.sentimentScore.timingSignal,
        confidence:     c.sentimentScore.confidence,
        reasoning:      c.sentimentScore.reasoning,
      },
      rationale:  generateRationale(c),
      eliteFlags: c.playerScore.flags.filter(f =>
        f.startsWith('ELITE_') || f === 'MULTI_TOOL_PROFILE'
      ),
    })),
  }

  writeFileSync('./data/output/buy-list.json', JSON.stringify(buyListJson, null, 2))
}

export async function generateBuyListFromFile(): Promise<void> {
  const composites: CompositeScore[] = JSON.parse(
    readFileSync('./data/output/scored-prospects.json', 'utf-8')
  )
  const meta: PipelineMeta = JSON.parse(
    readFileSync('./data/output/pipeline-meta.json', 'utf-8')
  )
  const config = getUserConfig()
  await generateBuyList(composites, meta, config)
}

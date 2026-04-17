import 'dotenv/config'
import { CardSightAI } from 'cardsightai'
import { cache } from '../cache.js'
import type { CardMarketData, UserConfig } from '../types.js'

export class CardSightError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardSightError'
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function emptyResult(overrides: Partial<CardMarketData> = {}): CardMarketData {
  return {
    cardFound: false,
    pricingAvailable: false,
    cardName: null,
    cardId: null,
    avgPrice: 0,
    recentAvg: 0,
    trendDirection: 'flat',
    trendConfidence: 'low',
    budgetFlag: false,
    compCount: 0,
    ...overrides,
  }
}

interface PricingRecord {
  title?: string | null
  price: number
  date?: string | null
  source: string
  listing_type?: string | null
  parallel_id?: string | null
  parallel_name?: string | null
}

interface PricingResponse {
  card: {
    card_id: string
    name: string
    number?: string | null
    set: { set_id: string; name: string; year: string; release: string }
  }
  raw: {
    period_days: number | null
    count: number
    records: PricingRecord[]
  }
  graded: unknown[]
  meta: { sources: string[]; last_sale_date: string | null; total_records: number }
}

function deriveTrend(
  chronological: number[],
): { direction: CardMarketData['trendDirection']; confidence: CardMarketData['trendConfidence'] } {
  const count = chronological.length
  const confidence: CardMarketData['trendConfidence'] =
    count >= 15 ? 'high' : count >= 6 ? 'medium' : 'low'

  if (count < 2) return { direction: 'flat', confidence }

  const half = Math.ceil(count / 2)
  const older = chronological.slice(0, half)
  const newer = chronological.slice(half)

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  const olderAvg = avg(older)
  const newerAvg = avg(newer)

  if (olderAvg === 0) return { direction: 'flat', confidence }

  const delta = (newerAvg - olderAvg) / olderAvg
  const direction: CardMarketData['trendDirection'] =
    delta > 0.1 ? 'rising' : delta < -0.1 ? 'falling' : 'flat'

  return { direction, confidence }
}

export async function fetchCardMarketData(
  playerName: string,
  config: UserConfig,
): Promise<CardMarketData> {
  const apiKey = process.env.CARDSIGHT_API_KEY
  if (!apiKey) throw new CardSightError('CARDSIGHT_API_KEY environment variable is not set')

  const cacheKey = `cardsight-${slugify(playerName)}`
  const cached = cache.get<CardMarketData>(cacheKey, 6)
  if (cached) return cached

  const client = new CardSightAI({ apiKey })

  // --- Goal 1: Anchor card lookup ---
  let anchorCard: { id: string; name: string; setName: string; releaseName: string; releaseYear: string } | null = null

  try {
    // Try multiple year windows — draft picks can appear in same or following year
    const currentYear = new Date().getFullYear()
    const yearsToTry = [String(currentYear), String(currentYear - 1), String(currentYear - 2)]

    for (const year of yearsToTry) {
      await sleep(300)
      const result = await client.catalog.cards.list({
        name: playerName,
        releaseName: 'Bowman',
        year,
        take: 100,
      })

      const cards: Array<{
        id: string; name: string; setName: string; releaseName: string; releaseYear: string; attributes?: string[]
      }> = (result as any)?.data?.cards ?? []

      if (cards.length === 0) continue

      // Prefer 1st Bowman Chrome base cards: setName contains "1st" or "First", no auto attribute
      const isAuto = (c: { attributes?: string[] }) =>
        c.attributes?.some(a => /^AUTO$/i.test(a)) ?? false

      const is1st = (c: { setName: string }) =>
        /1st|first/i.test(c.setName)

      const isBase = (c: { setName: string }) =>
        /base/i.test(c.setName)

      const scored = cards
        .filter(c => !isAuto(c))
        .map(c => ({ card: c, priority: is1st(c) ? 2 : isBase(c) ? 1 : 0 }))
        .sort((a, b) => b.priority - a.priority)

      if (scored.length > 0) {
        anchorCard = scored[0].card
        break
      }
    }

    // Fallback: no year restriction
    if (!anchorCard) {
      await sleep(300)
      const fallback = await client.catalog.cards.list({
        name: playerName,
        releaseName: 'Bowman',
        take: 100,
      })
      const cards: Array<{
        id: string; name: string; setName: string; releaseName: string; releaseYear: string; attributes?: string[]
      }> = (fallback as any)?.data?.cards ?? []

      const nonAuto = cards.filter(
        c => !(c.attributes?.some(a => /^AUTO$/i.test(a)) ?? false),
      )
      anchorCard = nonAuto[0] ?? null
    }
  } catch (err) {
    console.warn(`[CardSight] Catalog search failed for "${playerName}":`, err)
    const result = emptyResult()
    cache.set(cacheKey, result)
    return result
  }

  if (!anchorCard) {
    const result = emptyResult({ cardFound: false })
    cache.set(cacheKey, result)
    return result
  }

  // --- Goal 2: Pricing via REST ---
  let pricingData: PricingResponse | null = null

  try {
    const res = await fetch(`https://api.cardsight.ai/v1/pricing/${anchorCard.id}`, {
      headers: { 'x-api-key': apiKey },
    })

    if (!res.ok) {
      console.warn(`[CardSight] Pricing endpoint returned ${res.status} for card ${anchorCard.id}`)
    } else {
      pricingData = (await res.json()) as PricingResponse
    }
  } catch (err) {
    console.warn(`[CardSight] Pricing fetch failed for card ${anchorCard.id}:`, err)
  }

  // Base-card-only records (parallel_id null/undefined = base card listing)
  const baseRecords: PricingRecord[] = (pricingData?.raw?.records ?? []).filter(
    r => r.parallel_id == null,
  )

  if (!pricingData || baseRecords.length === 0) {
    const result = emptyResult({
      cardFound: true,
      pricingAvailable: false,
      cardName: `${anchorCard.releaseYear} ${anchorCard.releaseName} ${anchorCard.name}`,
      cardId: anchorCard.id,
      rawResponse: pricingData ?? undefined,
    })
    cache.set(cacheKey, result)
    return result
  }

  // Sort chronologically (oldest first) for trend analysis
  const sorted = [...baseRecords].sort(
    (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime(),
  )

  const prices = sorted.map(r => r.price)
  const avgPrice = prices.reduce((s, v) => s + v, 0) / prices.length

  // Recent = most recent 50% by date
  const recentSlice = sorted.slice(Math.floor(sorted.length / 2))
  const recentPrices = recentSlice.map(r => r.price)
  const recentAvg = recentPrices.reduce((s, v) => s + v, 0) / recentPrices.length

  const { direction: trendDirection, confidence: trendConfidence } = deriveTrend(prices)

  const budgetFlag = recentAvg > config.budgetCeiling

  const result: CardMarketData = {
    cardFound: true,
    pricingAvailable: true,
    cardName: `${anchorCard.releaseYear} ${anchorCard.releaseName} ${anchorCard.name}`,
    cardId: anchorCard.id,
    avgPrice,
    recentAvg,
    trendDirection,
    trendConfidence,
    budgetFlag,
    compCount: baseRecords.length,
    rawResponse: pricingData,
  }

  cache.set(cacheKey, result)
  return result
}

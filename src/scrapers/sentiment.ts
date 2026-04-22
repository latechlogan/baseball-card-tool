import 'dotenv/config'
import { cache } from '../cache.js'
import { assessHobbyAwareness } from '../ai.js'
import type { UserConfig, SentimentScore } from '../types.js'

function isFallback(result: SentimentScore): boolean {
  return result.reasoning === 'Sentiment analysis unavailable.' ||
         result.reasoning === 'Sentiment data unavailable.'
}

export async function fetchSentiment(
  playerName: string,
  _config:    UserConfig
): Promise<SentimentScore> {
  const slug     = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const cacheKey = `sentiment-v5-${slug}`

  const cached = cache.get<SentimentScore>(cacheKey, 48)
  if (cached) {
    console.log(`[cache] hit: ${cacheKey}`)
    return cached
  }

  console.log(`[sentiment] evaluating: ${playerName}`)

  const result = await assessHobbyAwareness(playerName)

  if (!isFallback(result)) {
    cache.set(cacheKey, result)
  } else {
    console.warn(`[sentiment] fallback result for ${playerName} — not caching`)
  }

  return result
}

export function getNeutralSentiment(): SentimentScore {
  return {
    awarenessLevel: 'unknown',
    timingSignal:   'WATCH',
    confidence:     'low',
    reasoning:      'Sentiment data unavailable.',
    summary:        'Sentiment data unavailable.',
    score:          50,
  }
}

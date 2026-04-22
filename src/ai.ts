import type { SentimentScore } from './types.js'

export async function assessHobbyAwareness(
  playerName: string
): Promise<SentimentScore> {
  const prompt = `You are evaluating hobby community awareness of a baseball prospect for a card investment tool. Search for current information about this player and determine whether their baseball cards represent a buying opportunity or whether the market has already priced them in.

Player: ${playerName}

Search for:
1. Recent news about this player (contract extensions, MLB debut, call-up, top prospect rankings)
2. Their current prospect status and ranking
3. Any hobby/card collecting community discussion or notable card sales

Based on what you find, classify their hobby awareness as exactly one of:
- unknown: no significant hobby discussion, not on collectors radar, no major news
- emerging: starting to get noticed, early prospect buzz, some hobby discussion appearing
- well_known: actively discussed in hobby community, on major prospect lists, cards are actively traded
- peak_hype: major recent news (contract extension, MLB debut, top 5 overall prospect), alpha is gone

Then provide:
- timingSignal: BUY_NOW (unknown/emerging) | WATCH (mixed or moderate) | AVOID (well_known at peak or peak_hype)
- confidence: high | medium | low
- reasoning: 1-2 sentences explaining your assessment, citing the specific information that drove your classification

Respond with JSON only. No preamble, no markdown fences.

{
  "awarenessLevel": "unknown" | "emerging" | "well_known" | "peak_hype",
  "timingSignal": "BUY_NOW" | "WATCH" | "AVOID",
  "confidence": "high" | "medium" | "low",
  "reasoning": "string"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        }
      ],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data    = await response.json() as any
  const content = data?.content ?? []

  const textBlock = content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()

  try {
    const clean  = textBlock.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    const scoreMap: Record<string, number> = {
      unknown:    85,
      emerging:   60,
      well_known: 25,
      peak_hype:  5,
    }

    return {
      awarenessLevel: parsed.awarenessLevel,
      timingSignal:   parsed.timingSignal,
      confidence:     parsed.confidence,
      reasoning:      parsed.reasoning,
      summary:        parsed.reasoning,
      score:          scoreMap[parsed.awarenessLevel] ?? 50,
    }
  } catch {
    console.warn('[ai] sentiment parse failed, using fallback')
    return getNeutralFallback()
  }
}

function getNeutralFallback(): SentimentScore {
  return {
    awarenessLevel: 'unknown',
    timingSignal:   'WATCH',
    confidence:     'low',
    reasoning:      'Sentiment analysis unavailable.',
    summary:        'Sentiment analysis unavailable.',
    score:          50,
  }
}

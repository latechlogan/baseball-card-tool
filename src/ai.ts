/**
 * ai.ts — Claude API client module.
 *
 * This is the ONLY place in the codebase that calls the Anthropic API directly.
 * All other modules that need AI capabilities must call functions exported from here.
 * This boundary keeps API key management, prompt versioning, and token accounting
 * centralized and auditable.
 */

import type { RedditPost } from './types.js'

export const aiClient = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  summarize: async (_text: string): Promise<string> => {
    throw new Error('Not implemented');
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  classifySentiment: async (_text: string): Promise<string> => {
    throw new Error('Not implemented');
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  calibrate: async (_data: unknown): Promise<unknown> => {
    throw new Error('Not implemented');
  },
};

export async function judgeProspectSentiment(
  playerName: string,
  posts:       RedditPost[],
  fetchMeta:   { successfulFetches: number, failedFetches: number, totalAttempted: number }
): Promise<{
  awarenessLevel: 'unknown' | 'emerging' | 'well_known' | 'peak_hype'
  timingSignal:   'BUY_NOW' | 'WATCH' | 'AVOID'
  confidence:     'high' | 'medium' | 'low'
  reasoning:      string
}> {
  const postSummary = posts.length === 0
    ? '(no posts found)'
    : posts
        .slice(0, 20)
        .map(p => `[r/${p.subreddit}] "${p.title}" (${p.numComments} comments)`)
        .join('\n')

  const fetchReliabilityNote = fetchMeta.failedFetches > fetchMeta.totalAttempted * 0.5
    ? 'NOTE: More than half of searches failed — zero posts may reflect rate limiting rather than genuine absence of discussion. Lower your confidence accordingly.'
    : ''

  const prompt = `You are evaluating hobby community awareness of a baseball prospect for a card investment tool. Your job is to determine whether the card market has already discovered this player or if there is still an early-entry buying window.

Player: ${playerName}
Reddit posts mentioning this player in the last 30 days: ${posts.length}
Fetch reliability: ${fetchMeta.successfulFetches}/${fetchMeta.totalAttempted} subreddit searches succeeded (${fetchMeta.failedFetches} failed due to rate limiting).
${fetchReliabilityNote}

Post titles:
${postSummary}

Classify this player's hobby awareness using exactly one of these levels:
- unknown: virtually no hobby discussion, not on collectors radar
- emerging: early discussion appearing, starting to get noticed by the hobby community
- well_known: actively and regularly discussed, hobby community is clearly aware
- peak_hype: major news coverage, contract extensions, mainstream prospect lists, top 100 appearances — alpha is gone

Rules:
- Daily stats threads, MiLB standout recaps, and bulk sale listings are mechanical and should NOT count as genuine community interest
- Name collision false positives (posts about different people with the same name) should be identified and discounted
- Contract signings, extensions, debut news, and top prospect rankings signal peak hype regardless of post count
- A player with 0-2 genuine hobby posts is unknown regardless of mechanical mentions

Based on your awareness classification, assign:
- timingSignal: BUY_NOW (unknown or emerging with no negative catalysts) | WATCH (mixed signals or moderate awareness) | AVOID (well_known at peak or peak_hype)
- confidence: high (clear signal, unambiguous posts) | medium (some noise or mixed signals) | low (very few posts, hard to judge)
- reasoning: exactly 1-2 sentences explaining your classification, explicitly noting any false positives, mechanical threads, or peak hype signals you identified

Respond with a JSON object only. No preamble, no markdown, no explanation outside the JSON.

Example response format:
{
  "awarenessLevel": "unknown",
  "timingSignal": "BUY_NOW",
  "confidence": "high",
  "reasoning": "Zero genuine hobby discussion found — all results were mechanical stats threads. No collector awareness detected."
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
      max_tokens: 200,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json() as any
  const text = data?.content?.[0]?.text?.trim() ?? ''

  try {
    const clean  = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      awarenessLevel: parsed.awarenessLevel,
      timingSignal:   parsed.timingSignal,
      confidence:     parsed.confidence,
      reasoning:      parsed.reasoning,
    }
  } catch {
    console.warn('[ai] sentiment judgment parse failed, using fallback')
    return {
      awarenessLevel: 'unknown',
      timingSignal:   'WATCH',
      confidence:     'low',
      reasoning:      'Sentiment analysis unavailable.',
    }
  }
}

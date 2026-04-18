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

export async function summarizeSentiment(
  playerName:   string,
  postCount:    number,
  chatterLevel: string,
  trend:        string,
  topPosts:     RedditPost[]
): Promise<string> {
  const topTitles = topPosts.slice(0, 3).map(p => `- "${p.title}"`).join('\n')

  const prompt = `You are analyzing hobby community sentiment for a baseball prospect card investment tool.

Player: ${playerName}
Reddit posts in last 30 days: ${postCount}
Chatter level: ${chatterLevel}
Trend: ${trend}
Top post titles:
${topTitles || '(no posts found)'}

Write exactly 1-2 sentences summarizing what this sentiment data means for someone deciding whether to buy this player's cards right now. Be direct and specific. Do not use filler phrases like "it's worth noting" or "overall."`.trim()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 150,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    console.warn(`[ai] summarizeSentiment failed: ${response.status}`)
    return 'Sentiment summary unavailable.'
  }

  const data = await response.json() as any
  return data?.content?.[0]?.text?.trim() ?? 'Sentiment summary unavailable.'
}

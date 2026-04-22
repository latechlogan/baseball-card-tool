import { cache } from '../cache.js'
import { judgeProspectSentiment } from '../ai.js'
import type { SentimentScore, RedditPost, UserConfig } from '../types.js'

const PRIMARY_SUBREDDITS = [
  'baseballcards',
  'mlbprospects',
  'dynastybaseball',
  'prospects',
  'milb',
  'onthefarm',
]

const SECONDARY_SUBREDDITS = [
  'baseballcards101',
  'fantasybaseball',
  'baseball',
]

export function getNeutralSentiment(): SentimentScore {
  return {
    awarenessLevel: 'unknown',
    timingSignal:   'WATCH',
    confidence:     'low',
    reasoning:      'Sentiment data unavailable.',
    summary:        'Sentiment data unavailable.',
    score:          50,
    postCount:      0,
    topPosts:       [],
  }
}

export async function fetchRedditSentiment(
  playerName: string,
  _config:     UserConfig
): Promise<SentimentScore> {
  const slug     = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const cacheKey = `reddit-sentiment-v4-${slug}`

  const cached = cache.get<SentimentScore>(cacheKey, 48)
  if (cached) {
    console.log(`[cache] hit: ${cacheKey}`)
    return cached
  }

  console.log(`[reddit] fetching posts for: ${playerName}`)

  const headers  = { 'User-Agent': 'baseball-card-tool/1.0 (research tool)' }
  const lastName = playerName.split(' ').at(-1)!
  const queries  = [playerName, lastName]

  const fetches = PRIMARY_SUBREDDITS.flatMap(sub =>
    queries.map(q => fetchSubreddit(sub, q, headers).catch(() => ({ posts: [] as RedditPost[], succeeded: false })))
  )
  const secondary = SECONDARY_SUBREDDITS.flatMap(sub =>
    queries.map(q => fetchSubreddit(sub, q, headers).catch(() => ({ posts: [] as RedditPost[], succeeded: false })))
  )

  const [primaryResults, secondaryResults] = await Promise.all([
    Promise.all(fetches),
    Promise.all(secondary),
  ])

  const allResults = [...primaryResults, ...secondaryResults]
  const successfulFetches = allResults.filter(r => r.succeeded).length
  const failedFetches     = allResults.filter(r => !r.succeeded).length

  const seen     = new Set<string>()
  const allPosts: RedditPost[] = []
  for (const { posts } of allResults) {
    for (const post of posts) {
      if (!seen.has(post.url)) {
        seen.add(post.url)
        allPosts.push(post)
      }
    }
  }

  allPosts.sort((a, b) => b.createdUtc - a.createdUtc)

  const judgment = await judgeProspectSentiment(playerName, allPosts, {
    successfulFetches,
    failedFetches,
    totalAttempted: successfulFetches + failedFetches,
  })

  const scoreMap: Record<string, number> = {
    unknown:    85,
    emerging:   60,
    well_known: 25,
    peak_hype:   5,
  }

  const result: SentimentScore = {
    awarenessLevel: judgment.awarenessLevel,
    timingSignal:   judgment.timingSignal,
    confidence:     judgment.confidence,
    reasoning:      judgment.reasoning,
    summary:        judgment.reasoning,
    score:          scoreMap[judgment.awarenessLevel] ?? 50,
    postCount:      allPosts.length,
    topPosts:       allPosts.slice(0, 5),
  }

  cache.set(cacheKey, result)
  return result
}

async function fetchWithBackoff(
  url:     string,
  headers: Record<string, string>
): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers })
    if (res.status === 429) {
      console.warn(`[reddit] rate limited — using fallback for this player`)
      return null
    }
    if (!res.ok) {
      console.warn(`[reddit] ${res.status} on ${url}`)
      return null
    }
    return res
  } catch (e) {
    console.warn(`[reddit] fetch error:`, e)
    return null
  }
}

async function fetchSubreddit(
  subreddit: string,
  query:     string,
  headers:   Record<string, string>
): Promise<{ posts: RedditPost[], succeeded: boolean }> {
  const url = `https://www.reddit.com/r/${subreddit}/search.json` +
    `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=25&t=month`

  const res = await fetchWithBackoff(url, headers)
  if (!res) return { posts: [], succeeded: false }

  await new Promise(resolve => setTimeout(resolve, 2000))

  const data     = await res.json() as any
  const posts    = data?.data?.children ?? []
  const lastName = query.split(' ').at(-1)!.toLowerCase()

  const filtered = posts
    .map((p: any) => p.data)
    .filter((p: any) => {
      const title = p.title?.toLowerCase() ?? ''
      return title.includes(lastName)
    })
    .map((p: any) => ({
      title:       p.title,
      subreddit,
      score:       p.score ?? 0,
      numComments: p.num_comments ?? 0,
      createdUtc:  p.created_utc ?? 0,
      url:         `https://reddit.com${p.permalink}`,
    }))

  return { posts: filtered, succeeded: true }
}

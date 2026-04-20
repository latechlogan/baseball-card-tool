import { cache } from '../cache.js'
import { summarizeSentiment } from '../ai.js'
import type { SentimentScore, RedditPost, UserConfig } from '../types.js'

const HEADERS = { 'User-Agent': 'baseball-card-tool/1.0 (research tool)' }
const CACHE_MAX_AGE_HOURS = 48

function deriveSentimentScore(
  chatter: 'low' | 'moderate' | 'high',
  trend:   'rising' | 'stable' | 'declining'
): number {
  // Low chatter = high score (market asleep = opportunity)
  // High chatter = low score (market awake = priced in)
  const chatterScore: Record<string, number> = {
    low:      80,
    moderate: 50,
    high:     20,
  }
  const trendAdj: Record<string, number> = {
    rising:   -15,  // sentiment rising = window closing
    stable:     0,
    declining: +10, // sentiment fading = re-entry opportunity
  }
  return Math.max(0, Math.min(100,
    chatterScore[chatter] + trendAdj[trend]
  ))
}

export function getNeutralSentiment(): SentimentScore {
  return {
    score:                 deriveSentimentScore('low', 'stable'),
    chatterLevel:          'low',
    trend:                 'stable',
    timingSignal:          'WATCH',
    summary:               'Sentiment data unavailable.',
    postCount:             0,
    commentCount:          0,
    mechanicalMentionCount: 0,
    topPosts:              [],
  }
}

const NEUTRAL_FALLBACK = getNeutralSentiment()

// Thread title patterns that indicate automated or structured data posts
// These mention players mechanically, not out of organic community interest
const MECHANICAL_THREAD_PATTERNS = [
  /\bdaily\b/i,
  /\bthread\b/i,
  /\bstandout/i,
  /\brecap\b/i,
  /\breport\b/i,
  /\broundup\b/i,
  /\bperformer/i,
  /\bnotable/i,
  /stats.*\d{1,2}[\/-]\d{1,2}/i,
  /\d{1,2}[\/-]\d{1,2}.*stats/i,
  /top.*prospect.*\d/i,
  /prospect.*watch/i,
  /for sale/i,
  /fs\b|ft\b|lf\b/i,
]

function isMechanicalThread(title: string): boolean {
  return MECHANICAL_THREAD_PATTERNS.some(pattern => pattern.test(title))
}

interface SubredditResult {
  organic:    RedditPost[]
  mechanical: RedditPost[]
}

function dedupByUrl(posts: RedditPost[]): RedditPost[] {
  const seen = new Set<string>()
  const out:  RedditPost[] = []
  for (const post of posts) {
    if (!seen.has(post.url)) {
      seen.add(post.url)
      out.push(post)
    }
  }
  return out
}

export async function fetchRedditSentiment(
  playerName: string,
  _config: UserConfig
): Promise<SentimentScore> {
  const slug     = playerName.toLowerCase().replace(/\s+/g, '-')
  const cacheKey = `reddit-sentiment-v3-${slug}`
  const cached   = cache.get<SentimentScore>(cacheKey, CACHE_MAX_AGE_HOURS)
  if (cached) return cached

  // Primary subreddits — highest signal for prospect card timing
  const PRIMARY_SUBREDDITS = [
    'baseballcards',
    'mlbprospects',
    'dynastybaseball',
    'prospects',
    'milb',
    'onthefarm',
  ]

  // Secondary subreddits — useful but lower volume or broader focus
  const SECONDARY_SUBREDDITS = [
    'baseballcards101',
    'fantasybaseball',
    'baseball',
  ]

  try {
    const subreddits = [...PRIMARY_SUBREDDITS, ...SECONDARY_SUBREDDITS]
    const queries    = [playerName, playerName.split(' ').at(-1)!]

    const fetches = subreddits.flatMap(sub =>
      queries.map(q =>
        fetchSubreddit(sub, q, HEADERS).catch(() => ({ organic: [], mechanical: [] } as SubredditResult))
      )
    )
    const results = await Promise.all(fetches)

    const allOrganic:    RedditPost[] = []
    const allMechanical: RedditPost[] = []

    for (const result of results) {
      allOrganic.push(...result.organic)
      allMechanical.push(...result.mechanical)
    }

    const organicPosts    = dedupByUrl(allOrganic)
    const mechanicalPosts = dedupByUrl(allMechanical)

    const postCount    = organicPosts.length
    const commentCount = organicPosts.reduce((sum, p) => sum + p.numComments, 0)
    const chatterLevel = classifyChatter(postCount, commentCount)
    const trend        = classifyTrend(organicPosts)
    const timingSignal = deriveTimingSignal(chatterLevel, trend)
    const topPosts     = organicPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    const summary = await summarizeSentiment(
      playerName, postCount, chatterLevel, trend, topPosts
    ).catch(() => 'Sentiment summary unavailable.')

    const result: SentimentScore = {
      score: deriveSentimentScore(chatterLevel, trend),
      chatterLevel,
      trend,
      timingSignal,
      summary,
      postCount,
      commentCount,
      mechanicalMentionCount: mechanicalPosts.length,
      topPosts,
    }

    cache.set(cacheKey, result)
    return result
  } catch {
    return NEUTRAL_FALLBACK
  }
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
): Promise<SubredditResult> {
  const url = `https://www.reddit.com/r/${subreddit}/search.json` +
    `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=25&t=month`

  const res = await fetchWithBackoff(url, headers)

  if (!res) {
    return { organic: [], mechanical: [] }
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const data  = await res.json() as any
  const raw   = data?.data?.children ?? []

  const posts: RedditPost[] = raw
    .map((p: any) => p.data)
    .filter((p: any) => {
      const lastName = query.split(' ').at(-1)!.toLowerCase()
      const text     = `${p.title} ${p.selftext ?? ''}`.toLowerCase()
      return text.includes(lastName)
    })
    .map((p: any) => ({
      title:       p.title,
      subreddit,
      score:       p.score ?? 0,
      numComments: p.num_comments ?? 0,
      createdUtc:  p.created_utc ?? 0,
      url:         `https://reddit.com${p.permalink}`,
    }))

  const organic    = posts.filter(p => !isMechanicalThread(p.title))
  const mechanical = posts.filter(p =>  isMechanicalThread(p.title))
  return { organic, mechanical }
}

function classifyChatter(postCount: number, commentCount: number): 'low' | 'moderate' | 'high' {
  const weightedScore = postCount * 2 + commentCount * 0.5

  if (weightedScore >= 30) return 'high'
  if (weightedScore >= 10) return 'moderate'
  return 'low'
}

function classifyTrend(posts: RedditPost[]): 'rising' | 'stable' | 'declining' {
  if (posts.length < 3) return 'stable'

  const now      = Date.now() / 1000
  const midpoint = now - (15 * 24 * 60 * 60)

  const recent = posts.filter(p => p.createdUtc >= midpoint)
  const older  = posts.filter(p => p.createdUtc <  midpoint)

  const recentRate = recent.length
  const olderRate  = older.length

  if (olderRate === 0) return recent.length > 0 ? 'rising' : 'stable'

  const delta = (recentRate - olderRate) / olderRate

  if (delta >  0.5) return 'rising'
  if (delta < -0.5) return 'declining'
  return 'stable'
}

function deriveTimingSignal(
  chatter: 'low' | 'moderate' | 'high',
  trend:   'rising' | 'stable' | 'declining'
): 'BUY_NOW' | 'WATCH' | 'AVOID' {
  if (chatter === 'high' && trend === 'rising')   return 'AVOID'
  if (chatter === 'high' && trend === 'stable')   return 'AVOID'

  if (chatter === 'low'  && trend === 'stable')   return 'BUY_NOW'
  if (chatter === 'low'  && trend === 'declining') return 'BUY_NOW'

  return 'WATCH'
}

import 'dotenv/config'
import { fetchRedditSentiment } from './reddit.js'
import { getUserConfig } from '../config.js'

const config = getUserConfig()

const players = ['Sebastian Walcott', 'Colt Emerson', 'Cristofer Torin']

for (const player of players) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(player)
  console.log('='.repeat(50))

  const sentiment = await fetchRedditSentiment(player, config)

  console.log(`Posts found:     ${sentiment.postCount}`)
  console.log(`Awareness:       ${sentiment.awarenessLevel}`)
  console.log(`Confidence:      ${sentiment.confidence}`)
  console.log(`Signal:          ${sentiment.timingSignal}`)
  console.log(`Reasoning:       ${sentiment.reasoning}`)

  if (sentiment.topPosts.length > 0) {
    console.log('\nTop posts:')
    sentiment.topPosts.slice(0, 3).forEach(p => {
      console.log(`  [${p.subreddit}] ${p.title} (↑${p.score}, ${p.numComments} comments)`)
    })
  }
}

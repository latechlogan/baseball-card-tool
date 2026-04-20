import 'dotenv/config'
import { readFileSync } from 'fs'
import { fetchRedditSentiment } from './reddit.js'
import { getUserConfig } from '../config.js'
import type { CompositeScore } from '../types.js'

const config  = getUserConfig()
const season  = process.argv.find(a => a.startsWith('--season='))?.split('=')[1]
             ?? process.argv[process.argv.indexOf('--season') + 1]
             ?? '2025'

const scored  = JSON.parse(
  readFileSync(`./data/output/scored-prospects.json`, 'utf-8')
) as CompositeScore[]

const players = scored.map(c => c.player.name)

console.log(`[sentiment:warm] warming cache for ${players.length} players`)
console.log(`[sentiment:warm] estimated time: ~${players.length * 15}s\n`)

for (const [i, name] of players.entries()) {
  console.log(`[${i + 1}/${players.length}] ${name}`)
  await fetchRedditSentiment(name, config)

  // 12 second gap between players — well under Reddit's rate limit
  // Each player makes up to 9 requests; 12s spacing = ~0.75 req/s average
  if (i < players.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 12000))
  }
}

console.log('\n[sentiment:warm] cache warm complete — run pipeline:2025 to use cached data')

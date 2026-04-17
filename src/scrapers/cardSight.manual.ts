import 'dotenv/config'
import { fetchCardMarketData } from './cardSight.js'
import { getUserConfig } from '../config.js'

const config = getUserConfig()

const players = ['Sebastian Walcott', 'Colt Emerson', 'Justin Crawford']

for (const player of players) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`${player}`)
  console.log('='.repeat(50))

  const data = await fetchCardMarketData(player, config)

  console.log(`Card found:        ${data.cardFound}`)
  console.log(`Card name:         ${data.cardName ?? 'N/A'}`)
  console.log(`Pricing available: ${data.pricingAvailable}`)
  console.log(`Comp count:        ${data.compCount}`)
  console.log(`Avg price:         $${data.avgPrice.toFixed(2)}`)
  console.log(`Recent avg:        $${data.recentAvg.toFixed(2)}`)
  console.log(`Trend:             ${data.trendDirection} (${data.trendConfidence} confidence)`)
  console.log(`Budget flag:       ${data.budgetFlag ? '⚠️ EXCEEDS CEILING' : '✅ Within budget'}`)
}

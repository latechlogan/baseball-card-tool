import 'dotenv/config'
import { CardSightAI } from 'cardsightai'

const apiKey = process.env.CARDSIGHT_API_KEY!
const client = new CardSightAI({ apiKey })

// Step 1: Search for Sebastian Walcott with correct params (name, not player; year as string)
console.log('\n=== SEARCH: Sebastian Walcott, Bowman, 2023 ===')
const r1 = await client.catalog.cards.list({
  name: 'Walcott',
  manufacturer: 'Bowman',
  year: '2023',
  take: 10
})
console.log(JSON.stringify(r1, null, 2))

// Step 2: Try without year in case it's 2024
console.log('\n=== SEARCH: Walcott, Bowman (any year) ===')
const r2 = await client.catalog.cards.list({
  name: 'Walcott',
  manufacturer: 'Bowman',
  take: 10
})
console.log(JSON.stringify(r2, null, 2))

// Step 3: Search for Paul Skenes (well-known prospect with definite pricing data)
console.log('\n=== SEARCH: Paul Skenes, Bowman Chrome ===')
const r3 = await client.catalog.cards.list({
  name: 'Paul Skenes',
  releaseName: 'Bowman Chrome',
  take: 10
})
console.log(JSON.stringify(r3, null, 2))

// Step 4: Get pricing for the first card with any results
const allResults = [r1, r2, r3]
let pricingCardId: string | null = null
for (const r of allResults) {
  const cards = (r as any)?.data?.cards ?? []
  if (cards.length > 0) {
    pricingCardId = cards[0].id
    console.log('\nUsing card for pricing:', JSON.stringify(cards[0], null, 2))
    break
  }
}

if (pricingCardId) {
  console.log('\n=== PRICING: /v1/pricing/{cardId} ===')
  const res = await fetch(`https://api.cardsight.ai/v1/pricing/${pricingCardId}`, {
    headers: { 'x-api-key': apiKey }
  })
  console.log(`Status: ${res.status}`)
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))
} else {
  // Fallback: get any card and test pricing shape
  console.log('\n=== FALLBACK: Any Bowman Chrome card ===')
  const fallback = await client.catalog.cards.list({
    releaseName: 'Bowman Chrome',
    manufacturer: 'Bowman',
    take: 5
  })
  console.log(JSON.stringify(fallback, null, 2))
  const fallbackCards = (fallback as any)?.data?.cards ?? []
  if (fallbackCards.length > 0) {
    const id = fallbackCards[0].id
    console.log('\n=== PRICING for fallback card ===')
    const res = await fetch(`https://api.cardsight.ai/v1/pricing/${id}`, {
      headers: { 'x-api-key': apiKey }
    })
    const data = await res.json()
    console.log(JSON.stringify(data, null, 2))
  }
}

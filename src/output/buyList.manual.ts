// Run with: npm run buylist
// Regenerates markdown from existing scored-prospects.json without re-running pipeline
import { generateBuyListFromFile } from './buyList.js'

await generateBuyListFromFile()
console.log('Buy list regenerated from existing pipeline output.')

// Run with: npm run scraper:ebay
import { fetchEbayComps } from './ebay.js';
import { getUserConfig } from '../config.js';

const config = getUserConfig();

const comps = await fetchEbayComps(
  'Sebastian Walcott',
  {
    setName:       'Bowman Chrome',
    isFirstBowman: true,
  },
  config
);

console.log(`\neBay Comps — Sebastian Walcott Bowman Chrome 1st`);
console.log(`Total comps found: ${comps.comps.length}`);
console.log(`Avg price: $${comps.avgPrice.toFixed(2)}`);
console.log(`Recent avg: $${comps.recentAvg.toFixed(2)}`);
console.log(`Trend: ${comps.trendDirection}`);

if (comps.comps.length > 0) {
  console.log('\nMost recent 5 sales:');
  console.table(
    comps.comps.slice(0, 5).map(c => ({
      date:      c.date,
      price:     `$${c.price.toFixed(2)}`,
      condition: c.condition ?? 'N/A',
      title:     c.title.slice(0, 60),
    }))
  );
}

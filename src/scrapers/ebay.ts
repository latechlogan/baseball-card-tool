import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { EbayComps, EbaySaleRecord, CardSearchFilters, UserConfig } from '../types.js';
import { cache } from '../cache.js';

const CACHE_MAX_AGE_HOURS = 6;
const EBAY_BASE_URL = 'https://www.ebay.com/sch/i.html';

export class EbayScraperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EbayScraperError';
  }
}

function buildSearchQuery(playerName: string, filters: CardSearchFilters): string {
  const parts = [playerName];
  if (filters.year)                      parts.push(String(filters.year));
  parts.push(filters.setName ?? 'Bowman Chrome');
  if (filters.isFirstBowman ?? true)     parts.push('1st');
  if (filters.parallel)                  parts.push(filters.parallel);
  if (filters.isAuto)                    parts.push('auto');
  return parts.join(' ');
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function buildCacheKey(playerName: string, query: string): string {
  return `ebay-comps-${slugify(playerName)}-${slugify(query)}`;
}

function parseSaleDate(rawDate: string): string {
  // eBay format: "Sold  Apr 16, 2026" or "Apr 16, 2026"
  const cleaned = rawDate.replace(/sold\s*/i, '').trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function parsePrice(raw: string): number {
  // Handle range like "$8.00 to $12.00" — take lower bound
  const rangeMatch = raw.match(/\$?([\d,]+\.?\d*)\s+to\s+\$?([\d,]+\.?\d*)/i);
  if (rangeMatch) {
    return parseFloat(rangeMatch[1].replace(/,/g, ''));
  }
  const single = raw.replace(/[^0-9.]/g, '');
  return parseFloat(single);
}

function detectTrend(comps: EbaySaleRecord[]): 'rising' | 'flat' | 'falling' {
  if (comps.length < 4) return 'flat';

  const sorted = [...comps].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const mid    = Math.floor(sorted.length / 2);
  const recent = sorted.slice(0, mid);
  const prior  = sorted.slice(mid);

  const avg = (arr: EbaySaleRecord[]) =>
    arr.reduce((sum, r) => sum + r.price, 0) / arr.length;

  const recentAvg = avg(recent);
  const priorAvg  = avg(prior);
  const delta     = (recentAvg - priorAvg) / priorAvg;

  if (delta >  0.10) return 'rising';
  if (delta < -0.10) return 'falling';
  return 'flat';
}

function detectParallelType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('auto') || t.includes('autograph')) return 'auto';
  const numberedMatch = t.match(/\/(\d+)/);
  if (numberedMatch) return `numbered-${numberedMatch[1]}`;
  if (t.includes('sapphire'))  return 'sapphire';
  if (t.includes('gold'))      return 'gold';
  if (t.includes('orange'))    return 'orange';
  if (t.includes('blue'))      return 'blue';
  if (t.includes('green'))     return 'green';
  if (t.includes('mojo'))      return 'mojo';
  if (t.includes('refractor')) return 'refractor';
  return 'base';
}

function trendConfidence(compCount: number): 'high' | 'medium' | 'low' {
  if (compCount >= 15) return 'high';
  if (compCount >= 6)  return 'medium';
  return 'low';
}

function emptyComps(): EbayComps {
  return {
    comps: [],
    trendDirection: 'flat',
    avgPrice: 0,
    recentAvg: 0,
    trendConfidence: 'low',
    dominantParallelType: 'base',
    consistencyPct: 100,
  };
}

export async function fetchEbayComps(
  playerName: string,
  cardFilters: CardSearchFilters,
  _config: UserConfig
): Promise<EbayComps> {
  const searchQuery = buildSearchQuery(playerName, cardFilters);
  const cacheKey    = buildCacheKey(playerName, searchQuery);

  const cached = cache.get<EbayComps>(cacheKey, CACHE_MAX_AGE_HOURS);
  if (cached) {
    console.log(`[cache] hit: ${cacheKey}`);
    return cached;
  }

  console.log(`[ebay] fetching comps: "${searchQuery}"`);

  const url = new URL(EBAY_BASE_URL);
  url.searchParams.set('_nkw', searchQuery);
  url.searchParams.set('_sacat', '213');
  url.searchParams.set('LH_Complete', '1');
  url.searchParams.set('LH_Sold', '1');
  url.searchParams.set('_sop', '13');
  url.searchParams.set('_ipg', '60');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      // networkidle is required — eBay renders listings via JS after initial load
      await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 });
    } catch (err) {
      throw new EbayScraperError(`Playwright navigation failed: ${(err as Error).message}`);
    }

    try {
      await page.waitForSelector('.srp-results', { timeout: 15000 });
    } catch {
      throw new EbayScraperError('eBay results container not found. Layout may have changed.');
    }

    const html = await page.content();
    const $    = cheerio.load(html);
    const listings: EbaySaleRecord[] = [];

    // eBay's current HTML uses li.s-card (not the old li.s-item)
    // Placeholder "Shop on eBay" cards live inside aria-hidden=true containers — skip those
    const playerLastName = playerName.split(' ').pop()?.toLowerCase() ?? '';

    $('ul.srp-results li.s-card').each((_i, el) => {
      // Skip items in aria-hidden carousels/injected placeholders
      const ariaHidden = $(el).closest('[aria-hidden="true"]').length > 0;
      if (ariaHidden) return;

      const title = $(el).find('div.s-card__title span.su-styled-text').first().text().trim();
      if (!title || title.toLowerCase().includes('shop on ebay')) return;
      if (title.toLowerCase().includes('lot')) return;
      // Reject listings that don't mention the player — these are generic bulk lots
      if (playerLastName && !title.toLowerCase().includes(playerLastName)) return;

      const priceRaw = $(el).find('span.s-card__price').first().text().trim();
      const price    = parsePrice(priceRaw);
      if (!price || isNaN(price) || price === 0) return;

      // Date is in "Sold  Apr 16, 2026" format
      const dateRaw = $(el).find('span.su-styled-text.positive.default').first().text().trim();
      const date    = parseSaleDate(dateRaw || '');

      // Condition is the first secondary.default span (not inside title)
      const condition = $(el).find('span.su-styled-text.secondary.default').first().text().trim();

      listings.push({
        price,
        date,
        title,
        condition: condition ?? '',
        cardDescription: title,
      });
    });

    if (listings.length === 0) {
      console.warn(`[ebay] warning: scraped page but found zero valid listings for "${searchQuery}"`);
      cache.set(cacheKey, emptyComps());
      return emptyComps();
    }

    const byParallel = listings.reduce((acc, comp) => {
      const type = detectParallelType(comp.title);
      acc[type] = [...(acc[type] ?? []), comp];
      return acc;
    }, {} as Record<string, EbaySaleRecord[]>);

    const dominantEntry = Object.entries(byParallel)
      .sort((a, b) => b[1].length - a[1].length)[0];

    const dominantParallelType = dominantEntry?.[0] ?? 'base';
    const cleanComps = dominantEntry?.[1] ?? listings;

    const consistencyPct = listings.length > 0
      ? Math.round((cleanComps.length / listings.length) * 100)
      : 100;

    if (cleanComps.length < listings.length) {
      console.log(
        `[ebay] parallel filter: kept ${cleanComps.length}/${listings.length} listings` +
        ` (dominant type: ${dominantParallelType}, ${consistencyPct}% consistent)`
      );
    }

    const avg = (arr: EbaySaleRecord[]) =>
      arr.reduce((sum, r) => sum + r.price, 0) / arr.length;

    const sorted = [...cleanComps].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const mid       = Math.floor(sorted.length / 2);
    const recentArr = sorted.slice(0, mid);

    const result: EbayComps = {
      comps:               sorted,
      trendDirection:      detectTrend(cleanComps),
      avgPrice:            avg(cleanComps),
      recentAvg:           recentArr.length > 0 ? avg(recentArr) : avg(cleanComps),
      trendConfidence:     trendConfidence(cleanComps.length),
      dominantParallelType,
      consistencyPct,
    };

    cache.set(cacheKey, result);
    return result;
  } finally {
    await browser.close();
  }
}

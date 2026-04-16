import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../data/cache');

const DEFAULT_MAX_AGE_HOURS = 24;

interface CacheEntry<T> {
  fetchedAt: string; // ISO date string
  data: T;
}

/**
 * Convert an arbitrary cache key to a filesystem-safe filename.
 * Replaces colons and forward slashes with dashes.
 */
function toSafeKey(key: string): string {
  return key.replace(/[:/]/g, '-');
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${toSafeKey(key)}.json`);
}

/**
 * Write data to the cache. Overwrites any existing entry for this key.
 */
function set(key: string, data: unknown): void {
  const entry: CacheEntry<unknown> = {
    fetchedAt: new Date().toISOString(),
    data,
  };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(key), JSON.stringify(entry, null, 2), 'utf-8');
}

/**
 * Read data from the cache.
 * Returns null if the key doesn't exist or the entry is older than maxAgeHours.
 */
function get<T>(key: string, maxAgeHours: number = DEFAULT_MAX_AGE_HOURS): T | null {
  const filePath = cachePath(key);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let entry: CacheEntry<T>;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    entry = JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }

  const fetchedAt = new Date(entry.fetchedAt).getTime();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (Date.now() - fetchedAt > maxAgeMs) {
    return null;
  }

  return entry.data;
}

/**
 * Delete the cache entry for a given key, if it exists.
 */
function invalidate(key: string): void {
  const filePath = cachePath(key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export const cache = { set, get, invalidate };

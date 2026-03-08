import fs from 'fs/promises';
import path from 'path';
import os from 'os';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type CacheOptions = {
  ttlMs: number;
  maxEntries: number;
  persistenceDir?: string;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for persistent cache
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.hareio', 'cache', 'web');

export class PersistentCache<T> {
  private memoryEntries = new Map<string, CacheEntry<T>>();
  private ttlMs: number;
  private maxEntries: number;
  private persistenceDir: string;

  constructor(options?: Partial<CacheOptions>) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.persistenceDir = options?.persistenceDir ?? DEFAULT_CACHE_DIR;
    
    // Ensure cache directory exists
    void fs.mkdir(this.persistenceDir, { recursive: true }).catch(() => {});
  }

  async get(key: string): Promise<T | undefined> {
    const memoryEntry = this.memoryEntries.get(key);
    if (memoryEntry) {
      if (Date.now() > memoryEntry.expiresAt) {
        this.memoryEntries.delete(key);
      } else {
        return memoryEntry.value;
      }
    }

    // Try filesystem
    try {
      const filePath = this.getFilePath(key);
      const raw = await fs.readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<T>;
      
      if (Date.now() > entry.expiresAt) {
        await fs.unlink(filePath).catch(() => {});
        return undefined;
      }

      // Backfill memory cache
      this.memoryEntries.set(key, entry);
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T, ttlOverrideMs?: number): Promise<void> {
    const ttl = ttlOverrideMs ?? this.ttlMs;
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttl };
    
    this.memoryEntries.set(key, entry);
    if (this.memoryEntries.size > this.maxEntries) {
      const oldestKey = this.memoryEntries.keys().next().value as string | undefined;
      if (oldestKey) this.memoryEntries.delete(oldestKey);
    }

    try {
      const filePath = this.getFilePath(key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
    } catch (e) {
      console.error(`[Cache] Failed to persist key ${key}:`, e);
    }
  }

  async clear(): Promise<void> {
    this.memoryEntries.clear();
    try {
      const files = await fs.readdir(this.persistenceDir);
      await Promise.all(files.map(f => fs.unlink(path.join(this.persistenceDir, f))));
    } catch {}
  }

  private getFilePath(key: string): string {
    const safeKey = Buffer.from(key).toString('base64').replace(/\//g, '_').slice(0, 100);
    return path.join(this.persistenceDir, `${safeKey}.json`);
  }
}

export function normalizeCacheKey(input: string): string {
  return input.trim().toLowerCase();
}

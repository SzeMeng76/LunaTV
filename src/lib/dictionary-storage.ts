// src/lib/dictionary-storage.ts
import { RedisClientType } from 'redis';

// 默认词典（回退用）
// 如果你打算把词典放到单独文件，可替换回以下导入：
import { DEFAULT_DICTIONARY } from './dictionary-default';
//const DEFAULT_DICTIONARY: string[] = [];

// 获取 Kvrocks 客户端（复用全局单例）
function getKvrocksClient(): RedisClientType {
  const globalSymbol = Symbol.for('__MOONTV_KVROCKS_CLIENT__');
  const client = (global as any)[globalSymbol];
  if (!client) {
    throw new Error(
      'Kvrocks client not initialized. Please ensure NEXT_PUBLIC_STORAGE_TYPE=kvrocks and KVROCKS_URL is set.'
    );
  }
  return client;
}

const DICTIONARY_KEY = 'dictionary:words';
const VERSION_KEY = 'dictionary:version';

export async function loadDictionary(): Promise<string[]> {
  try {
    const client = getKvrocksClient();
    const data = await client.get(DICTIONARY_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load dictionary from Kvrocks:', error);
  }
  // 回退到默认词典
  return [...DEFAULT_DICTIONARY];
}

export async function saveDictionary(words: string[]): Promise<void> {
  const cleaned = Array.from(
    new Set(words.map((w) => w.trim()).filter((w) => w.length > 0))
  );
  const client = getKvrocksClient();
  await client.set(DICTIONARY_KEY, JSON.stringify(cleaned));
  await client.set(VERSION_KEY, Date.now().toString());
}

export async function resetDictionary(): Promise<void> {
  const client = getKvrocksClient();
  await client.set(DICTIONARY_KEY, JSON.stringify(DEFAULT_DICTIONARY));
  await client.set(VERSION_KEY, Date.now().toString());
}

export async function getDictionaryVersion(): Promise<number> {
  try {
    const client = getKvrocksClient();
    const version = await client.get(VERSION_KEY);
    return version ? parseInt(version, 10) : 0;
  } catch {
    return 0;
  }
}

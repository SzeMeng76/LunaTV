/**
 * Vercel Blob Storage utilities for Spider JAR caching
 * Only works on Vercel deployment with BLOB_READ_WRITE_TOKEN configured
 */

import { head, put } from '@vercel/blob';

const SPIDER_JAR_BLOB_NAME = 'spider.jar';

/**
 * Check if Blob Storage is available (Vercel environment with token)
 */
export function isBlobAvailable(): boolean {
  return !!(
    process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.VERCEL &&
    process.env.VERCEL === '1'
  );
}

/**
 * Get Spider JAR from Blob Storage
 * Returns null if not found or error
 */
export async function getSpiderJarFromBlob(): Promise<{
  url: string;
} | null> {
  if (!isBlobAvailable()) {
    return null;
  }

  try {
    const blob = await head(SPIDER_JAR_BLOB_NAME);
    return {
      url: blob.url,
    };
  } catch (error) {
    console.warn('[Blob] Spider JAR not found in Blob Storage:', error);
    return null;
  }
}

/**
 * Upload Spider JAR to Blob Storage
 */
export async function uploadSpiderJarToBlob(
  buffer: Buffer,
  md5: string,
  source: string
): Promise<string | null> {
  if (!isBlobAvailable()) {
    console.warn('[Blob] Blob Storage not available, skipping upload');
    return null;
  }

  try {
    const blob = await put(SPIDER_JAR_BLOB_NAME, buffer, {
      access: 'public',
      addRandomSuffix: false,
    });

    console.log(`[Blob] ✅ Spider JAR uploaded to Blob: ${blob.url}`);
    console.log(`[Blob] MD5: ${md5}, Source: ${source}`);
    return blob.url;
  } catch (error) {
    console.error('[Blob] Failed to upload Spider JAR:', error);
    return null;
  }
}

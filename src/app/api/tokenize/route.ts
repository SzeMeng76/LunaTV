import { NextRequest, NextResponse } from 'next/server';

import { getDictionaryVersion,loadDictionary } from '@/lib/dictionary-storage';

let cachedRegexList: RegExp[] | null = null;
let cachedVersion = 0;
const CHUNK_SIZE = 2000;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegexList(words: string[]): RegExp[] {
  const uniqueWords = Array.from(new Set(words));
  uniqueWords.sort((a, b) => b.length - a.length);
  const regexList: RegExp[] = [];
  for (let i = 0; i < uniqueWords.length; i += CHUNK_SIZE) {
    const chunk = uniqueWords.slice(i, i + CHUNK_SIZE).map(escapeRegExp);
    regexList.push(new RegExp(chunk.join('|'), 'giu'));
  }
  return regexList;
}

async function getCurrentRegexList(): Promise<RegExp[]> {
  const currentVersion = await getDictionaryVersion();
  if (cachedRegexList && cachedVersion === currentVersion) {
    return cachedRegexList;
  }
  const words = await loadDictionary();
  cachedRegexList = buildRegexList(words);
  cachedVersion = currentVersion;
  return cachedRegexList;
}

async function tokenizeWithDict(text: string): Promise<string[]> {
  if (!text) return [];
  const regexList = await getCurrentRegexList();
  const matched = new Set<string>();
  for (const re of regexList) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0]) matched.add(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return Array.from(matched);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const text = searchParams.get('text');

  if (!text || typeof text !== 'string') {
    return NextResponse.json(
      { error: '请提供有效的 "text" 查询参数' },
      { status: 400 }
    );
  }

  try {
    const words = await tokenizeWithDict(text.trim());
    words.sort((a, b) => b.length - a.length);
    return NextResponse.json({ words });
  } catch (error) {
    console.error('分词处理异常:', error);
    return NextResponse.json({ words: [] });
  }
}

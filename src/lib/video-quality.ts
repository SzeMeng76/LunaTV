import type { SearchResult } from './types';

export interface ResolutionFilter {
  minLevel: number;
  strict: boolean;
  requested: string;
}

const RESOLUTION_LABELS: Array<{ level: number; label: string }> = [
  { level: 2160, label: '4K' },
  { level: 1440, label: '2K' },
  { level: 1080, label: '1080p' },
  { level: 720, label: '720p' },
  { level: 480, label: '480p' },
  { level: 360, label: '360p' },
];

const DEFAULT_FILTER: ResolutionFilter = {
  minLevel: 0,
  strict: false,
  requested: '',
};

function parseBoolean(value: string | null): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on', 'strict'].includes(value.toLowerCase());
}

export function formatResolutionLabel(level: number): string {
  const option = RESOLUTION_LABELS.find((item) => item.level === level);
  return option?.label || (level > 0 ? `${level}p` : '');
}

export function normalizeResolutionLevel(value: unknown): number {
  if (value == null) return 0;

  const raw = String(value).trim();
  if (!raw || ['all', 'any', 'off', 'none', '0'].includes(raw.toLowerCase())) {
    return 0;
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  if (['4k', 'uhd', '2160', '2160p'].includes(normalized)) return 2160;
  if (['2k', 'qhd', '1440', '1440p'].includes(normalized)) return 1440;
  if (['fhd', 'fullhd', '1080', '1080p'].includes(normalized)) return 1080;
  if (['hd', '720', '720p'].includes(normalized)) return 720;
  if (['sd', '480', '480p'].includes(normalized)) return 480;
  if (['360', '360p'].includes(normalized)) return 360;

  const numeric = Number.parseInt(normalized.replace(/p$/, ''), 10);
  if (!Number.isFinite(numeric)) return 0;

  const candidates = RESOLUTION_LABELS.map((item) => item.level).sort(
    (a, b) => a - b,
  );
  return candidates.find((level) => numeric <= level) || 2160;
}

export function buildResolutionFilterFromSearchParams(
  searchParams: URLSearchParams,
): ResolutionFilter {
  const requested =
    searchParams.get('minResolution') ||
    searchParams.get('min_resolution') ||
    searchParams.get('resolution') ||
    searchParams.get('quality') ||
    searchParams.get('minQuality') ||
    '';
  const minLevel = normalizeResolutionLevel(requested);
  if (minLevel <= 0) return DEFAULT_FILTER;

  return {
    minLevel,
    strict:
      parseBoolean(searchParams.get('resolutionStrict')) ||
      parseBoolean(searchParams.get('strictResolution')) ||
      parseBoolean(searchParams.get('qualityStrict')),
    requested,
  };
}

function collectExplicitResolutionLevels(text: string): number[] {
  const normalized = text.toLowerCase();
  const levels: number[] = [];

  const dimensionPattern =
    /(?:^|[^0-9])(?:3840|2560|1920|1280|854|640)\s*[x×]\s*(2160|1440|1080|720|480|360)(?:$|[^0-9])/g;
  let dimensionMatch: RegExpExecArray | null;
  while ((dimensionMatch = dimensionPattern.exec(normalized)) !== null) {
    const match = dimensionMatch;
    levels.push(normalizeResolutionLevel(match[1]));
  }

  const pixelPattern =
    /(?:^|[^0-9])(?:2160|1440|1080|720|480|360)\s*[pi]?(?:$|[^0-9])/g;
  let pixelMatch: RegExpExecArray | null;
  while ((pixelMatch = pixelPattern.exec(normalized)) !== null) {
    const match = pixelMatch;
    const value = match[0].match(/(2160|1440|1080|720|480|360)/)?.[1];
    levels.push(normalizeResolutionLevel(value));
  }

  if (
    /(?:^|[^a-z0-9])(?:4k|uhd|ultrahd|ultra\s*hd)(?:$|[^a-z0-9])/.test(
      normalized,
    )
  ) {
    levels.push(2160);
  }
  if (/(?:^|[^a-z0-9])(?:2k|qhd)(?:$|[^a-z0-9])/.test(normalized)) {
    levels.push(1440);
  }
  if (
    /(?:^|[^a-z0-9])(?:fhd|fullhd|full\s*hd)(?:$|[^a-z0-9])/.test(normalized)
  ) {
    levels.push(1080);
  }
  if (/(?:^|[^a-z0-9])hd(?:$|[^a-z0-9])/.test(normalized)) {
    levels.push(720);
  }
  if (/(?:^|[^a-z0-9])sd(?:$|[^a-z0-9])/.test(normalized)) {
    levels.push(480);
  }

  if (/\u84dd\u5149|\u8d85\u6e05/.test(text)) levels.push(1080);
  if (/\u9ad8\u6e05/.test(text)) levels.push(720);
  if (/\u6807\u6e05/.test(text)) levels.push(480);
  if (/\u67aa\u7248/.test(text)) levels.push(360);

  if (/蓝光|超清/.test(text)) levels.push(1080);
  if (/高清/.test(text)) levels.push(720);
  if (/标清/.test(text)) levels.push(480);
  if (/(?:^|[^a-z0-9])(?:cam|tc|ts)(?:$|[^a-z0-9])|枪版/.test(normalized)) {
    levels.push(360);
  }

  return levels.filter((level) => level > 0);
}

export function inferResolutionLevelFromText(
  ...fields: Array<unknown>
): number {
  const text = fields
    .filter((value) => value != null)
    .map((value) => String(value))
    .join(' ');
  if (!text.trim()) return 0;

  const levels = collectExplicitResolutionLevels(text);
  return levels.length > 0 ? Math.max(...levels) : 0;
}

export function decorateSearchResultQuality<T extends SearchResult>(
  result: T,
  ...qualityFields: Array<unknown>
): T {
  const explicitLevel = normalizeResolutionLevel(result.resolution_level);
  const inferredLevel =
    explicitLevel ||
    inferResolutionLevelFromText(
      result.resolution,
      result.quality_tag,
      result.remarks,
      result.title,
      result.type_name,
      result.class,
      result.desc,
      result.episodes?.join(' '),
      ...qualityFields,
    );

  if (inferredLevel <= 0) return result;

  return {
    ...result,
    resolution_level: inferredLevel,
    resolution: formatResolutionLabel(inferredLevel),
  };
}

export function getSearchResultResolutionLevel(result: SearchResult): number {
  return (
    normalizeResolutionLevel(result.resolution_level) ||
    inferResolutionLevelFromText(
      result.resolution,
      result.quality_tag,
      result.remarks,
      result.title,
      result.type_name,
      result.class,
      result.desc,
      result.episodes?.join(' '),
    )
  );
}

export function filterSearchResultsByResolution<T extends SearchResult>(
  results: T[],
  filter: ResolutionFilter,
): T[] {
  if (!filter.minLevel) return results;

  return results.filter((result) => {
    const level = getSearchResultResolutionLevel(result);
    if (level >= filter.minLevel) return true;
    return level === 0 && !filter.strict;
  });
}

export function serializeResolutionFilter(
  filter: ResolutionFilter,
): Record<string, string> {
  if (!filter.minLevel) return {};
  return {
    minResolution: String(filter.minLevel),
    resolutionStrict: filter.strict ? '1' : '0',
  };
}

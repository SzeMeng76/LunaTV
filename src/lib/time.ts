/**
 * 时间格式转换函数
 * 处理形如 "20250824000000 +0800" 的时间格式
 */
export function parseCustomTimeFormat(timeStr: string): Date {
  // 如果已经是标准格式，直接返回
  if (timeStr.includes('T') || timeStr.includes('-')) {
    return new Date(timeStr);
  }

  // 处理 "20250824000000 +0800" 格式
  // 格式说明：YYYYMMDDHHMMSS +ZZZZ
  const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/);

  if (match) {
    const [, year, month, day, hour, minute, second, timezone] = match;

    // 创建ISO格式的时间字符串
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone}`;
    return new Date(isoString);
  }

  // 如果格式不匹配，尝试其他常见格式
  return new Date(timeStr);
}

/**
 * 格式化时间为 HH:MM 格式
 */
export function formatTimeToHHMM(timeString: string): string {
  try {
    const date = parseCustomTimeFormat(timeString);
    if (isNaN(date.getTime())) {
      return timeString; // 如果解析失败，返回原始字符串
    }
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return timeString;
  }
}

/**
 * 判断时间是否有效
 */
export function isValidTime(timeString: string): boolean {
  try {
    const date = parseCustomTimeFormat(timeString);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * 将秒数格式化为时间字符串
 * @param seconds 秒数
 * @returns 格式化的时间字符串 (HH:MM:SS 或 MM:SS)
 */
export function formatTime(seconds: number): string {
  if (seconds === 0) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num: number) => num.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/** 时间与数字的展示格式化。 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "刚刚 / 5 分钟前 / 3 小时前 / 昨天 / 3 天前 / 2026-10-22" */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;

  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 2 * DAY) return "昨天";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;

  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return sameYear ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`;
}

/** 完整的本地时间，用在消息详情的 title 提示上。 */
export function fullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 毫秒 -> "1.2s" / "840ms" / "2m 5s" */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** 1234 -> "1.2k"，1234567 -> "1.2M" */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** 取名字首字符做头像占位，中英都取第一个字。 */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return Array.from(trimmed)[0].toUpperCase();
}

/** 路径尾段，用于在窄侧边栏里显示项目目录。 */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

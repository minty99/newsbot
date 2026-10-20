// 날짜는 모두 KST 기준 "YYYY-MM-DD" 문자열로 다룬다.
// new Date("YYYY-MM-DD")는 UTC로 해석돼 하루 어긋날 수 있으므로 쓰지 않고 UTC 산술만 한다.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  return toYmd(parse(value)) === value;
}

function parse(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  return toYmd(parse(ymd) + days * 86_400_000);
}

/** from~to 양 끝 포함 일수 */
export function daysInclusive(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / 86_400_000) + 1;
}

export function maxDate(a: string, b: string) {
  return a > b ? a : b;
}

export function minDate(a: string, b: string) {
  return a < b ? a : b;
}

/** "10월 20일 (화)" */
export function formatDate(ymd: string, withWeekday = true): string {
  const [, m, d] = ymd.split("-").map(Number);
  const base = `${m}월 ${d}일`;
  if (!withWeekday) return base;
  return `${base} (${WEEKDAYS[new Date(parse(ymd)).getUTCDay()]})`;
}

/** "10월 18일 ~ 10월 20일" (같은 날이면 하나만) */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const left = sameYear ? formatDate(from, false) : `${from.slice(0, 4)}년 ${formatDate(from, false)}`;
  return `${left} ~ ${formatDate(to, false)}`;
}

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO 8601 시각 → KST "10:12" */
export function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : TIME_FMT.format(ms);
}

/** "10/20" */
export function formatMonthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

const KOREA_TIME_ZONE = "Asia/Seoul"

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  // PostgreSQL timestamp (without time zone) values are emitted without an offset.
  // The application stores these values in UTC, so make that interpretation explicit.
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value.replace(" ", "T") + "Z"
    : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatKoreaDateTime(value: Date | string | number | null | undefined) {
  const date = toDate(value)
  if (!date) return "—"
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
}

export function formatKoreaDate(value: Date | string | number | null | undefined) {
  const date = toDate(value)
  if (!date) return "—"
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

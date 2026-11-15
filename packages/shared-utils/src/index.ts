// Pure utility functions — no I/O, no external dependencies.

// ─── Date / Time ──────────────────────────────────────────────────────────────

/** Format an ISO timestamp for display (locale-aware) */
export function formatDateTime(
  iso: string,
  options: { locale?: string; timeZone?: string } = {}
): string {
  const { locale = "en-GB", timeZone = "UTC" } = options;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

/** Format an ISO date string (YYYY-MM-DD) for display */
export function formatDate(
  iso: string,
  options: { locale?: string; timeZone?: string } = {}
): string {
  const { locale = "en-GB", timeZone = "UTC" } = options;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(iso));
}

/** Add days to a Date and return a new Date */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Returns true if the given ISO string date has elapsed */
export function isExpired(isoDate: string): boolean {
  return new Date(isoDate) < new Date();
}

/** Current ISO timestamp */
export function nowIso(): string {
  return new Date().toISOString();
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/** Format a numeric amount for display */
export function formatCurrency(
  amount: number,
  currency: string,
  options: { locale?: string } = {}
): string {
  const { locale = "en-GB" } = options;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── String ───────────────────────────────────────────────────────────────────

/** Generate a URL-safe slug from a string */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Mask a string — show first N and last N characters */
export function maskString(value: string, visibleStart = 4, visibleEnd = 4): string {
  if (value.length <= visibleStart + visibleEnd) return "***";
  return `${value.slice(0, visibleStart)}***${value.slice(-visibleEnd)}`;
}

/** Normalise phone to E.164 (basic — does not replace libphonenumber) */
export function normalisePhone(phone: string, defaultCountryCode = "966"): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("+")) return phone.trim();
  if (digits.startsWith("0")) return `+${defaultCountryCode}${digits.slice(1)}`;
  return `+${defaultCountryCode}${digits}`;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function calcOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isIsoDate(value: string): boolean {
  return !isNaN(Date.parse(value));
}

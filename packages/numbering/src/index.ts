// ─── Reference number formatting ─────────────────────────────────────────────
// Pure formatting functions only.
// The actual sequence number is allocated by the Postgres next_sequence() function.

export type EntityType =
  | "ticket"
  | "work_order"
  | "quotation"
  | "invoice"
  | "complaint"
  | "bulk_request";

const ENTITY_SUFFIX: Record<EntityType, string> = {
  ticket: "TKT",
  work_order: "WO",
  quotation: "QT",
  invoice: "INV",
  complaint: "CMP",
  bulk_request: "BSR",
};

/**
 * Format a reference number string.
 * @param prefix    Tenant-configured prefix (e.g. "ACE")
 * @param entity    Entity type code
 * @param year      4-digit year
 * @param month     1-12
 * @param seq       Sequence number from Postgres next_sequence()
 * @param seqWidth  Minimum digits for seq (zero-padded), default 5
 */
export function formatReferenceNumber(
  prefix: string,
  entity: EntityType,
  year: number,
  month: number,
  seq: number,
  seqWidth = 5
): string {
  const yyyymm = `${year}${String(month).padStart(2, "0")}`;
  const seqStr = String(seq).padStart(seqWidth, "0");
  const suffix = ENTITY_SUFFIX[entity];
  return `${prefix}-${suffix}-${yyyymm}-${seqStr}`;
}

/**
 * Validate that a reference number matches the expected format.
 */
export function isValidReferenceNumber(value: string): boolean {
  return /^[A-Z0-9]+-[A-Z]+-\d{6}-\d{5,}$/.test(value);
}

/**
 * Extract components from a reference number.
 * Returns null if the format does not match.
 */
export function parseReferenceNumber(
  value: string
): { prefix: string; suffix: string; yearMonth: string; seq: number } | null {
  const match = /^([A-Z0-9]+)-([A-Z]+)-(\d{6})-(\d+)$/.exec(value);
  if (!match) return null;
  const [, prefix, suffix, yearMonth, seqStr] = match;
  return {
    prefix: prefix!,
    suffix: suffix!,
    yearMonth: yearMonth!,
    seq: parseInt(seqStr!, 10),
  };
}

/** Build the year_month string used in the DB sequence table */
export function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}${String(m).padStart(2, "0")}`;
}

// ============================================================================
// CareOS Pricing & VAT Calculation Engine
// Enforces standard precision financial math, 15% VAT, and discounts
// ============================================================================

export interface LineItemInput {
  id?: string;
  type: "labour" | "part" | "travel" | "fee";
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxRate?: number;
}

export interface CalculatedLineItem {
  id: string;
  type: "labour" | "part" | "travel" | "fee";
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface QuotationCalculationResult {
  lineItems: CalculatedLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
}

const DEFAULT_TAX_RATE = 0.15; // 15% standard VAT (Saudi Arabia / GCC)

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function calculateQuotationTotals(
  rawItems: LineItemInput[],
  defaultTaxRate = DEFAULT_TAX_RATE,
  currency = "SAR"
): QuotationCalculationResult {
  let subtotal = 0;
  let taxAmount = 0;

  const calculatedItems: CalculatedLineItem[] = rawItems.map((item, index) => {
    const qty = Math.max(0, item.quantity);
    const price = Math.max(0, item.unitPrice);
    const discount = Math.max(0, Math.min(qty * price, item.discountAmount ?? 0));
    const rate = item.taxRate !== undefined ? Math.max(0, item.taxRate) : defaultTaxRate;

    const lineSubtotal = round2(qty * price - discount);
    const lineTax = round2(lineSubtotal * rate);
    const lineTotal = round2(lineSubtotal + lineTax);

    subtotal += lineSubtotal;
    taxAmount += lineTax;

    return {
      id: item.id || `item-${index + 1}`,
      type: item.type,
      description: item.description,
      quantity: qty,
      unitPrice: price,
      discountAmount: discount,
      taxRate: rate,
      lineSubtotal,
      lineTax,
      lineTotal,
    };
  });

  subtotal = round2(subtotal);
  taxAmount = round2(taxAmount);
  const totalAmount = round2(subtotal + taxAmount);

  return {
    lineItems: calculatedItems,
    subtotal,
    taxRate: defaultTaxRate,
    taxAmount,
    totalAmount,
    currency,
  };
}

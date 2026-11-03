import { Prisma } from "@prisma/client";

const Money = Prisma.Decimal.clone({ precision: 40 });

export function calculatePricing(items: { unitPrice: Prisma.Decimal.Value; quantity: number }[]) {
    const itemSubtotals = items.map((item) => new Money(item.unitPrice).mul(item.quantity));
    const subtotal = itemSubtotals.reduce((sum, value) => sum.add(value), new Money(0));
    const rate = subtotal.gte(1000000) ? "0.10" : subtotal.gte(500000) ? "0.05" : "0";
    const discountAmount = Money.min(subtotal.mul(rate), new Money(150000)).toDecimalPlaces(2);
    return { itemSubtotals, subtotal, discountAmount, grandTotal: subtotal.sub(discountAmount) };
}

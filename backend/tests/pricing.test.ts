import { describe, expect, it } from "vitest";
import { calculatePricing } from "../src/modules/orders/pricing";

describe("Variant A pricing", () => {
    it.each([
        [499999, "0", "499999"], [500000, "25000", "475000"],
        [999999, "49999.95", "949999.05"], [1000000, "100000", "900000"],
        [1500000, "150000", "1350000"], [2000000, "150000", "1850000"],
    ])("prices subtotal %s exactly", (value, discount, total) => {
        const result = calculatePricing([{ unitPrice: value, quantity: 1 }]);
        expect(result.subtotal.toString()).toBe(String(value));
        expect(result.discountAmount.toString()).toBe(discount);
        expect(result.grandTotal.toString()).toBe(total);
    });
    it("keeps full precision for maximum allowed price and quantity", () => {
        const result = calculatePricing([{ unitPrice: "999999999999999", quantity: 2147483647 }, { unitPrice: 1, quantity: 1 }]);
        expect(result.itemSubtotals.map((value) => value.toFixed(0))).toEqual(["2147483646999997852516353", "1"]);
        expect(result.subtotal.toFixed(2)).toBe("2147483646999997852516354.00");
        expect(result.grandTotal.toFixed(2)).toBe("2147483646999997852366354.00");
    });
    it("sums line totals before applying discount", () => {
        const result = calculatePricing([{ unitPrice: 125000, quantity: 3 }, { unitPrice: 125000, quantity: 1 }]);
        expect(result.itemSubtotals.map(String)).toEqual(["375000", "125000"]);
        expect(result.discountAmount.toString()).toBe("25000");
    });
});

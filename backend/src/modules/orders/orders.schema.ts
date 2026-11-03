import { z } from "zod";
import { paginationSchema } from "../../shared/pagination";

const positiveInt = z.number().int().positive().max(2147483647);
export const orderIdSchema = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const createOrderSchema = z.strictObject({
    customer_id: positiveInt,
    items: z.array(z.strictObject({ product_id: positiveInt, quantity: positiveInt })).min(1),
}).superRefine(({ items }, ctx) => {
    const seen = new Set<number>();
    items.forEach((item, index) => {
        if (seen.has(item.product_id)) ctx.addIssue({ code: "custom", path: ["items", index, "product_id"], message: "Duplicate product" });
        seen.add(item.product_id);
    });
});
export const idempotencyKeySchema = z.string().trim().min(1).max(200).optional();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !value.startsWith("0000-") && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
export const listOrdersSchema = paginationSchema.safeExtend({
    status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
    date_from: dateSchema.optional(),
    date_to: dateSchema.optional(),
}).refine(({ date_from, date_to }) => !date_from || !date_to || date_from <= date_to, {
    path: ["date_to"], message: "date_to must be on or after date_from",
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;

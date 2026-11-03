import { z } from "zod";
import { paginationSchema } from "../../shared/pagination";

export const createProductSchema = z.object({
    product_code: z.string().trim().min(1).max(50).regex(/^[^\u0000]*$/, "Must not contain NUL characters"),
    name: z.string().trim().min(1).max(200).regex(/^[^\u0000]*$/, "Must not contain NUL characters"),
    price: z.number().int().positive().max(999999999999999),
    stock: z.number().int().min(0).max(2147483647),
});

export const updateProductSchema = createProductSchema;

export const listProductsSchema = paginationSchema.safeExtend({
    search: z.string().trim().regex(/^[^\u0000]*$/, "Must not contain NUL characters").default(""),
});

export const productIdSchema = z.coerce.number().int().positive().max(2147483647);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;

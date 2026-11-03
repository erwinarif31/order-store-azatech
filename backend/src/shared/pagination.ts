import { z } from "zod";

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(10),
}).refine(({ page, per_page }) => Number.isSafeInteger((page - 1) * per_page), {
    path: ["page"],
    message: "Page is too large",
});

export type PaginationMeta = z.infer<typeof paginationSchema> & { total: number };

export function parsePagination(query: unknown) {
    const { page, per_page } = paginationSchema.parse(query);
    return { page, per_page, skip: (page - 1) * per_page, take: per_page };
}

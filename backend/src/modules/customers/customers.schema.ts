import { z } from "zod";

export const createCustomerSchema = z.object({
    name: z.string().trim().min(1).max(120).regex(/^[^\u0000]*$/, "Must not contain NUL characters"),
    email: z.string().email().max(254).optional(),
    phone: z.string().trim().max(30).regex(/^[^\u0000]*$/, "Must not contain NUL characters").optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

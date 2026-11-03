import { z } from "zod";

export const loginSchema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
        message: "Password must not exceed 72 bytes",
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;

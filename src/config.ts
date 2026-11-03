import "dotenv/config";
import { z } from "zod";

const environment = z.object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().trim().min(32),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
}).safeParse(process.env);

if (!environment.success) {
    throw new Error(`Invalid environment configuration: ${environment.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

export const config = environment.data;

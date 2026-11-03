import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { loginSchema } from "../src/modules/auth/auth.schema";

const db = new PrismaClient();

async function seed() {
    const { email, password } = loginSchema.parse({
        email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
        password: process.env.SEED_ADMIN_PASSWORD ?? "Admin123!",
    });
    await db.user.upsert({
        where: { email },
        update: {},
        create: {
            name: "Admin",
            email,
            passwordHash: await bcrypt.hash(password, 12),
        },
    });
    console.log(`Admin ready: ${email}`);
}

seed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => db.$disconnect());

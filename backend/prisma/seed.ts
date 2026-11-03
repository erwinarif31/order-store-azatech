import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import { loginSchema } from "../src/modules/auth/auth.schema";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for seeding");

const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedAdmin() {
    const { email, password } = loginSchema.parse({
        email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
        password: process.env.SEED_ADMIN_PASSWORD || "Admin123!",
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

async function seedProducts() {
    for (let index = 1; index <= 15; index++) {
        const productCode = `SEED-PRODUCT-${String(index).padStart(3, "0")}`;
        await db.product.upsert({
            where: { productCode }, update: {},
            create: { productCode, name: `Seed Product ${index}`, price: index * 25000, stock: index * 10 },
        });
    }
}

async function seedCustomers() {
    for (let index = 1; index <= 10; index++) {
        const email = `seed-customer-${index}@example.com`;
        if (!await db.customer.findFirst({ where: { email } })) {
            await db.customer.create({ data: { name: `Seed Customer ${index}`, email, phone: `080000000${String(index).padStart(2, "0")}` } });
        }
    }
}

async function seed() {
    await seedAdmin();
    await seedProducts();
    await seedCustomers();
}

seed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => db.$disconnect());

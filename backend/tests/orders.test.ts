import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = "orders-tests-only-secret-at-least-32-characters";
const userId = randomUUID();
let app: typeof import("../src/app").app;
let db: typeof import("../src/db").db;
let token: string;

beforeAll(async () => {
    ({ app } = await import("../src/app"));
    ({ db } = await import("../src/db"));
    await db.user.create({ data: { id: userId, name: "Orders Test", email: `orders-${userId}@example.com`, passwordHash: await bcrypt.hash("TestPassword123!", 12) } });
    token = jwt.sign({}, process.env.JWT_SECRET!, { subject: userId, expiresIn: "1h", algorithm: "HS256" });
});
afterAll(async () => {
    if (db) {
        try { await db.user.deleteMany({ where: { id: userId } }); }
        finally { await db.$disconnect(); }
    }
});

const auth = { type: "bearer" as const };
async function fixture(prices = [250000], stock = 10) {
    const customer = await request(app).post("/api/customers").auth(token, auth).send({ name: `Orders ${randomUUID()}` });
    expect(customer.status).toBe(201);
    const products: { id: number; product_code: string; name: string; price: number; stock: number }[] = [];
    for (const price of prices) {
        const fields = { product_code: `order-${randomUUID()}`, name: `Order product ${randomUUID()}`, price, stock };
        const response = await request(app).post("/api/products").auth(token, auth).send(fields);
        expect(response.status).toBe(201);
        products.push({ ...fields, id: response.body.data.id });
    }
    return { products, body: { customer_id: customer.body.data.id as number, items: products.map((product) => ({ product_id: product.id, quantity: 1 })) } };
}
function create(body: object, key?: string) {
    const call = request(app).post("/api/orders").auth(token, auth);
    if (key !== undefined) call.set("Idempotency-Key", key);
    return call.send(body);
}
function patch(id: number, action: "pay" | "cancel") {
    return request(app).patch(`/api/orders/${id}/${action}`).auth(token, auth);
}
async function stock(id: number) {
    return (await db.product.findUniqueOrThrow({ where: { id } })).stock;
}

describe("orders API with PostgreSQL", () => {
    it("calculates authoritative totals, snapshots products, and deducts stock", async () => {
        const { products, body } = await fixture([333333, 333333]);
        body.items[0]!.quantity = 2;
        const response = await create(body);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ success: true, message: "OK", data: { status: "PENDING", customer_id: body.customer_id, subtotal: "999999", discount_amount: "49999.95", grand_total: "949999.05", order_number: expect.stringMatching(/^INV-\d{8}-\d{4}$/) } });
        expect(response.body.data.items).toHaveLength(2);
        expect(await stock(products[0]!.id)).toBe(8);
        expect(await stock(products[1]!.id)).toBe(9);
        const product = products[0]!;
        expect((await request(app).put(`/api/products/${product.id}`).auth(token, auth).send({ ...product, name: "Changed", price: 1, stock: 8 })).status).toBe(200);
        const detail = await request(app).get(`/api/orders/${response.body.data.id}`).auth(token, auth);
        expect(detail.status).toBe(200);
        expect(detail.body.data.items[0]).toMatchObject({ product_name: product.name, product_code: product.product_code, unit_price: "333333", subtotal: "666666" });
        expect(detail.body.data.grand_total).toBe("949999.05");
    });

    it("rolls back every item, order, stock, and counter on insufficient stock", async () => {
        const { products, body } = await fixture([10, 20], 2);
        body.items[1]!.quantity = 3;
        const beforeOrders = await db.order.count({ where: { customerId: body.customer_id } });
        const beforeItems = await db.orderItem.count({ where: { productId: { in: products.map((p) => p.id) } } });
        const response = await create(body);
        expect(response.status).toBe(422);
        expect(response.body.errors["items.1.quantity"][0]).toMatch(/remaining 2, requested 3/);
        expect(await Promise.all(products.map((p) => stock(p.id)))).toEqual([2, 2]);
        expect(await db.order.count({ where: { customerId: body.customer_id } })).toBe(beforeOrders);
        expect(await db.orderItem.count({ where: { productId: { in: products.map((p) => p.id) } } })).toBe(beforeItems);
    });

    it.each([0, -1, 1.5, 2147483648, "1"])('rejects quantity %s', async (quantity) => {
        const { body } = await fixture();
        const response = await create({ ...body, items: [{ ...body.items[0], quantity }] });
        expect(response.status).toBe(422);
        expect(response.body.errors["items.0.quantity"]).toEqual(expect.any(Array));
    });
    it("rejects duplicate lines, empty items, client prices, totals and unknown keys", async () => {
        const { body } = await fixture();
        const duplicate = await create({ ...body, items: [body.items[0], body.items[0]] });
        expect(duplicate.status).toBe(422);
        expect(duplicate.body.errors["items.1.product_id"]).toEqual(expect.any(Array));
        for (const invalid of [
            { ...body, items: [] }, { ...body, items: [{ ...body.items[0], unit_price: 1 }] },
            { ...body, subtotal: 1 }, { ...body, surprise: true },
        ]) expect((await create(invalid)).status).toBe(422);
    });
    it("returns structured missing customer/product errors and validates identifiers", async () => {
        const { body } = await fixture();
        const customer = await create({ ...body, customer_id: 2147483647 });
        expect(customer.status).toBe(422);
        expect(customer.body.errors.customer_id).toEqual(expect.any(Array));
        const product = await create({ ...body, items: [{ product_id: 2147483647, quantity: 1 }] });
        expect(product.status).toBe(422);
        expect(product.body.errors["items.0.product_id"]).toEqual(expect.any(Array));
        for (const id of ["bad", "0", "2147483648"]) {
            const response = await request(app).get(`/api/orders/${id}`).auth(token, auth);
            expect(response.status).toBe(422);
            expect(response.body.errors.id).toEqual(expect.any(Array));
        }
        for (const path of ["/api/orders/2147483647", "/api/orders/2147483647/pay", "/api/orders/2147483647/cancel"]) {
            const response = path.endsWith("2147483647") ? await request(app).get(path).auth(token, auth) : await request(app).patch(path).auth(token, auth);
            expect(response.status).toBe(404);
        }
    });
    it("pays once, cancels paid orders once, and never restores twice", async () => {
        const { products, body } = await fixture();
        const order = (await create(body)).body.data;
        expect((await patch(order.id, "pay")).body.data.status).toBe("PAID");
        expect(await stock(products[0]!.id)).toBe(9);
        expect((await patch(order.id, "pay")).status).toBe(409);
        expect((await patch(order.id, "cancel")).body.data.status).toBe("CANCELLED");
        expect(await stock(products[0]!.id)).toBe(10);
        expect((await patch(order.id, "cancel")).status).toBe(409);
        expect((await patch(order.id, "pay")).status).toBe(409);
        expect(await stock(products[0]!.id)).toBe(10);
    });
    it("rejects stock restoration overflow and rolls back status", async () => {
        const { products, body } = await fixture();
        const created = await create(body);
        const product = products[0]!;
        expect((await request(app).put(`/api/products/${product.id}`).auth(token, auth).send({ ...product, stock: 2147483647 })).status).toBe(200);
        const response = await patch(created.body.data.id, "cancel");
        expect(response.status).toBe(409);
        expect(response.body.message).toMatch(/maximum/);
        expect((await db.order.findUniqueOrThrow({ where: { id: created.body.data.id } })).status).toBe("PENDING");
        expect(await stock(product.id)).toBe(2147483647);
    });

    it.each([1, 2, 3])("serializes scarce-stock orders and concurrent cancellation run %s", async () => {
        const { products, body } = await fixture([1], 1);
        const responses = await Promise.all([create(body), create(body)]);
        expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
        expect(await stock(products[0]!.id)).toBe(0);
        const order = responses.find((r) => r.status === 201)!.body.data;
        const cancelled = await Promise.all([patch(order.id, "cancel"), patch(order.id, "cancel")]);
        expect(cancelled.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await stock(products[0]!.id)).toBe(1);
    });
    it("allocates unique invoices during concurrent creation", async () => {
        const fixtures = await Promise.all(Array.from({ length: 5 }, () => fixture([1])));
        const responses = await Promise.all(fixtures.map(({ body }) => create(body)));
        expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
        expect(new Set(responses.map((r) => r.body.data.order_number)).size).toBe(5);
    });
    it("replays sequential keys, normalized item order and current status without stock changes", async () => {
        const { products, body } = await fixture([10, 20]);
        const key = randomUUID();
        const first = await create(body, ` ${key} `);
        expect(first.status).toBe(201);
        expect((await patch(first.body.data.id, "pay")).status).toBe(200);
        const replay = await create({ ...body, items: [...body.items].reverse() }, key);
        expect(replay.status).toBe(200);
        expect(replay.body.data.id).toBe(first.body.data.id);
        expect(replay.body.data.status).toBe("PAID");
        expect(await Promise.all(products.map((p) => stock(p.id)))).toEqual([9, 9]);
        const changed = await create({ ...body, items: [{ ...body.items[0], quantity: 2 }] }, key);
        expect(changed.status).toBe(409);
        expect(await Promise.all(products.map((p) => stock(p.id)))).toEqual([9, 9]);
        expect(await db.order.count({ where: { customerId: body.customer_id } })).toBe(1);
    });
    it.each([1, 2, 3])("replays simultaneous keys exactly once run %s", async () => {
        const { products, body } = await fixture([1], 1);
        const key = randomUUID();
        const responses = await Promise.all([create(body, key), create(body, key), create(body, key)]);
        expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
        expect(new Set(responses.map((r) => r.body.data.id)).size).toBe(1);
        expect(await stock(products[0]!.id)).toBe(0);
    });
    it("can retry the same key after a failed creation and restock", async () => {
        const { products, body } = await fixture([1], 0);
        const key = randomUUID();
        expect((await create(body, key)).status).toBe(422);
        const product = products[0]!;
        expect((await request(app).put(`/api/products/${product.id}`).auth(token, auth).send({ ...product, stock: 2 })).status).toBe(200);
        const response = await create(body, key);
        expect(response.status).toBe(201);
        expect(await stock(product.id)).toBe(1);
        expect((await create(body, key)).body.data.id).toBe(response.body.data.id);
        expect(await stock(product.id)).toBe(1);
    });
    it("rejects blank and oversized idempotency keys", async () => {
        const { body } = await fixture();
        for (const key of ["   ", "x".repeat(201)]) expect((await create(body, key)).status).toBe(422);
    });
    it("filters history by status and inclusive UTC dates with stable pagination", async () => {
        const { body } = await fixture();
        const first = await create(body);
        const second = await create(body);
        expect((await patch(first.body.data.id, "pay")).status).toBe(200);
        // Give each fixture customer its own historical day, including across reruns.
        const start = new Date(Date.UTC(2000, 0, 1) + body.customer_id * 86400000);
        const day = start.toISOString().slice(0, 10);
        await db.order.updateMany({ where: { id: { in: [first.body.data.id, second.body.data.id] } }, data: { createdAt: new Date(start.getTime() + 86400000 - 1) } });
        const query = { date_from: day, date_to: day, per_page: 1 };
        const page1 = await request(app).get("/api/orders").auth(token, auth).query({ ...query, page: 1 });
        const page2 = await request(app).get("/api/orders").auth(token, auth).query({ ...query, page: 2 });
        expect(page1.status).toBe(200);
        expect(page1.body.meta).toEqual({ page: 1, per_page: 1, total: 2 });
        expect(page2.body.meta).toEqual({ page: 2, per_page: 1, total: 2 });
        expect(page1.body.data[0].id).toBe(second.body.data.id);
        expect(page2.body.data[0].id).toBe(first.body.data.id);
        const paid = await request(app).get("/api/orders").auth(token, auth).query({ ...query, status: "PAID" });
        expect(paid.body.meta.total).toBe(1);
        expect(paid.body.data[0].id).toBe(first.body.data.id);
        const empty = await request(app).get("/api/orders").auth(token, auth).query({ ...query, status: "CANCELLED" });
        expect(empty.body.data).toEqual([]);
    });
    it.each([
        { date_from: "2025-02-29" }, { date_to: "2024-02-30" }, { date_from: "bad" },
        { date_from: "0000-01-01" }, { date_to: "0000-12-31" },
        { date_from: "2025-02-02", date_to: "2025-02-01" }, { status: "UNKNOWN" }, { page: 0 }, { per_page: 101 },
    ])("validates history filters %j", async (query) => {
        const response = await request(app).get("/api/orders").auth(token, auth).query(query);
        expect(response.status).toBe(422);
        expect(Object.keys(response.body.errors).length).toBeGreaterThan(0);
    });
    it.each([
        ["post", "/api/orders"], ["get", "/api/orders"], ["get", "/api/orders/1"],
        ["patch", "/api/orders/1/pay"], ["patch", "/api/orders/1/cancel"],
    ] as const)("requires authentication for %s %s", async (method, path) => {
        const response = await request(app)[method](path);
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, message: "Unauthorized", errors: {} });
    });
});

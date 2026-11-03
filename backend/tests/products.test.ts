import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database");
}

const id = randomUUID();
let app: typeof import("../src/app").app;
let db: typeof import("../src/db").db;
let token: string;

beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = "products-tests-only-secret-at-least-32-characters";
    ({ app } = await import("../src/app"));
    ({ db } = await import("../src/db"));
    await db.user.create({
        data: { id, email: `products-${id}@example.com`, name: "Products Test", passwordHash: await bcrypt.hash("TestPassword123!", 12) },
    });
    token = jwt.sign({}, process.env.JWT_SECRET!, { subject: id, expiresIn: "1h", algorithm: "HS256" });
});

// HTTP-created fixtures persist; use a dedicated disposable test database.
afterAll(async () => {
    if (db) {
        try {
            await db.user.deleteMany({ where: { id } });
        } finally {
            await db.$disconnect();
        }
    }
});

function product() {
    const suffix = randomUUID();
    return { product_code: `code-${suffix}`, name: `Product ${suffix}`, price: 12500, stock: 7 };
}

async function createProduct(fields = product()) {
    const response = await request(app).post("/api/products").auth(token, { type: "bearer" }).send(fields);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, message: "OK", data: { id: expect.any(Number), product_code: fields.product_code, name: fields.name, stock: fields.stock } });
    expect(response.body.data.id).toBeGreaterThan(0);
    expect(Number(response.body.data.price)).toBe(fields.price);
    return response.body.data as { id: number; product_code: string; name: string; price: string | number; stock: number };
}

async function searchProducts(search: string) {
    const response = await request(app).get("/api/products").auth(token, { type: "bearer" }).query({ search });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, message: "OK", data: expect.any(Array) });
    return response;
}

function expectFailure(response: request.Response) {
    expect(response.body).toMatchObject({ success: false, message: expect.any(String), errors: expect.any(Object) });
    expect(Array.isArray(response.body.errors)).toBe(false);
    for (const messages of Object.values(response.body.errors)) {
        expect(messages).toEqual(expect.any(Array));
        for (const message of messages as unknown[]) expect(message).toEqual(expect.any(String));
    }
}

describe("products API with PostgreSQL", () => {
    it("creates a product and persists it in a subsequent list search", async () => {
        const fields = product();
        const created = await createProduct(fields);
        const response = await searchProducts(fields.product_code);
        expect(response.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, product_code: fields.product_code, name: fields.name, stock: fields.stock })]));
        const persisted = response.body.data.find((item: { id: number }) => item.id === created.id);
        expect(Number(persisted.price)).toBe(fields.price);
    });

    it("returns default pagination metadata", async () => {
        const response = await request(app).get("/api/products").auth(token, { type: "bearer" });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, message: "OK", data: expect.any(Array), meta: { page: 1, per_page: 10, total: expect.any(Number) } });
        expect(response.body.meta.total).toBeGreaterThanOrEqual(0);
    });

    it("paginates three matching products without assuming sort order", async () => {
        const prefix = `page-${randomUUID()}`;
        const created = [];
        for (let index = 0; index < 3; index++) {
            created.push(await createProduct({ ...product(), name: `${prefix}-${index}` }));
        }
        const pages = [];
        for (const page of [1, 2]) {
            const response = await request(app).get("/api/products").auth(token, { type: "bearer" }).query({ search: prefix, page, per_page: 2 });
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ success: true, message: "OK", data: expect.any(Array), meta: { page, per_page: 2, total: 3 } });
            expect(response.body.data).toHaveLength(page === 1 ? 2 : 1);
            pages.push(...response.body.data);
        }
        const ids = pages.map((item: { id: number }) => item.id);
        expect(new Set(ids).size).toBe(3);
        expect(new Set(ids)).toEqual(new Set(created.map((item) => item.id)));
    });

    it("searches by name", async () => {
        const created = await createProduct();
        const response = await searchProducts(created.name);
        expect(response.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, name: created.name })]));
    });

    it("searches by product_code", async () => {
        const created = await createProduct();
        const response = await searchProducts(created.product_code);
        expect(response.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, product_code: created.product_code })]));
    });

    it("returns an empty page for an unmatched search", async () => {
        const response = await searchProducts(`missing-${randomUUID()}`);
        expect(response.body.data).toEqual([]);
        expect(response.body.meta.total).toBe(0);
    });

    it.each([
        ["product_code", ""],
        ["product_code", "NUL\u0000"],
        ["name", ""],
        ["name", "NUL\u0000"],
        ["price", 0],
        ["price", -1],
        ["stock", -1],
    ] as const)("rejects invalid create field %s=%s", async (field, value) => {
        const response = await request(app).post("/api/products").auth(token, { type: "bearer" }).send({ ...product(), [field]: value });
        expect(response.status).toBe(422);
        expectFailure(response);
        expect(response.body.errors[field]).toEqual(expect.any(Array));
        expect(response.body.errors[field].length).toBeGreaterThan(0);
        for (const error of response.body.errors[field]) expect(error).toEqual(expect.any(String));
    });

    it("rejects duplicate product codes on create", async () => {
        const fields = product();
        await createProduct(fields);
        const response = await request(app).post("/api/products").auth(token, { type: "bearer" }).send({ ...product(), product_code: fields.product_code });
        expect(response.status).toBe(409);
        expectFailure(response);
    });

    it("updates all product fields and persists the changes", async () => {
        const created = await createProduct();
        const fields = { ...product(), price: 25750, stock: 0 };
        const response = await request(app).put(`/api/products/${created.id}`).auth(token, { type: "bearer" }).send(fields);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, message: "OK", data: { id: created.id, product_code: fields.product_code, name: fields.name, stock: fields.stock } });
        expect(Number(response.body.data.price)).toBe(fields.price);
        const listed = await searchProducts(fields.product_code);
        expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, product_code: fields.product_code, name: fields.name, stock: fields.stock })]));
        expect(Number(listed.body.data.find((item: { id: number }) => item.id === created.id).price)).toBe(fields.price);
    });

    it("rejects a duplicate-code update without changing either product", async () => {
        const first = await createProduct();
        const second = await createProduct();
        const response = await request(app).put(`/api/products/${second.id}`).auth(token, { type: "bearer" }).send({ ...product(), product_code: first.product_code });
        expect(response.status).toBe(409);
        expectFailure(response);
        for (const original of [first, second]) {
            const listed = await searchProducts(original.product_code);
            const persisted = listed.body.data.find((item: { id: number }) => item.id === original.id);
            expect(persisted).toMatchObject({ id: original.id, product_code: original.product_code, name: original.name, stock: original.stock });
            expect(Number(persisted.price)).toBe(Number(original.price));
        }
    });

    it("returns 404 when updating a missing product", async () => {
        const response = await request(app).put("/api/products/2147483647").auth(token, { type: "bearer" }).send(product());
        expect(response.status).toBe(404);
        expectFailure(response);
    });

    it.each([["price", 0], ["stock", -1], ["product_code", "NUL\u0000"], ["name", "NUL\u0000"]] as const)("rejects invalid update field %s=%s", async (field, value) => {
        const created = await createProduct();
        const response = await request(app).put(`/api/products/${created.id}`).auth(token, { type: "bearer" }).send({ ...product(), [field]: value });
        expect(response.status).toBe(422);
        expectFailure(response);
        expect(response.body.errors[field]).toEqual(expect.any(Array));
        expect(response.body.errors[field].length).toBeGreaterThan(0);
        for (const error of response.body.errors[field]) expect(error).toEqual(expect.any(String));
    });

    it("rejects NUL characters in product search", async () => {
        const response = await request(app).get("/api/products").auth(token, { type: "bearer" }).query({ search: "NUL\u0000" });
        expect(response.status).toBe(422);
        expectFailure(response);
        expect(response.body.errors.search).toEqual(expect.any(Array));
        expect(response.body.errors.search.length).toBeGreaterThan(0);
    });

    it.each([["page", 0], ["per_page", 0], ["per_page", 101]] as const)("rejects invalid pagination %s=%s", async (field, value) => {
        const response = await request(app).get("/api/products").auth(token, { type: "bearer" }).query({ [field]: value });
        expect(response.status).toBe(422);
        expectFailure(response);
        expect(response.body.errors[field]).toEqual(expect.any(Array));
        expect(response.body.errors[field].length).toBeGreaterThan(0);
        for (const error of response.body.errors[field]) expect(error).toEqual(expect.any(String));
    });

    it.each(["get", "post", "put"] as const)("requires authentication for %s products", async (method) => {
        const path = method === "put" ? `/api/products/${randomUUID()}` : "/api/products";
        const call = request(app)[method](path);
        const response = await (method === "get" ? call : call.send(product()));
        expect(response.status).toBe(401);
        expectFailure(response);
    });
});

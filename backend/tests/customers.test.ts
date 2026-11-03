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
    process.env.JWT_SECRET = "customers-tests-only-secret-at-least-32-characters";
    ({ app } = await import("../src/app"));
    ({ db } = await import("../src/db"));
    await db.user.create({
        data: { id, email: `customers-${id}@example.com`, name: "Customers Test", passwordHash: await bcrypt.hash("TestPassword123!", 12) },
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

function expectFailure(response: request.Response) {
    expect(response.body).toMatchObject({ success: false, message: expect.any(String), errors: expect.any(Object) });
    expect(Array.isArray(response.body.errors)).toBe(false);
    for (const messages of Object.values(response.body.errors)) {
        expect(messages).toEqual(expect.any(Array));
        for (const message of messages as unknown[]) expect(message).toEqual(expect.any(String));
    }
}

describe("customers API with PostgreSQL", () => {
    it("creates a customer with contact details and persists it in the list", async () => {
        const suffix = randomUUID();
        const fields = { name: `Customer ${suffix}`, email: `customer-${suffix}@example.com`, phone: "081234567890" };
        const response = await request(app).post("/api/customers").auth(token, { type: "bearer" }).send(fields);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ success: true, message: "OK", data: { id: expect.any(Number), ...fields } });
        expect(response.body.data.id).toBeGreaterThan(0);
        const listed = await request(app).get("/api/customers").auth(token, { type: "bearer" });
        expect(listed.status).toBe(200);
        expect(listed.body).toMatchObject({ success: true, message: "OK", data: expect.any(Array) });
        expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: response.body.data.id, ...fields })]));
    });

    it("creates a customer with only a name", async () => {
        const name = `Name only ${randomUUID()}`;
        const response = await request(app).post("/api/customers").auth(token, { type: "bearer" }).send({ name });
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ success: true, message: "OK", data: { id: expect.any(Number), name } });
        expect(response.body.data.id).toBeGreaterThan(0);
    });

    it("returns a customer list envelope", async () => {
        const response = await request(app).get("/api/customers").auth(token, { type: "bearer" });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, message: "OK", data: expect.any(Array) });
    });

    it.each([
        { label: "missing name", field: "name", fields: {} },
        { label: "empty name", field: "name", fields: { name: "" } },
        { label: "NUL name", field: "name", fields: { name: "NUL\u0000" } },
        { label: "NUL phone", field: "phone", fields: { name: `NUL phone ${randomUUID()}`, phone: "080\u0000" } },
        { label: "invalid email", field: "email", fields: { name: `Invalid email ${randomUUID()}`, email: "invalid" } },
    ])("rejects $label", async ({ field, fields }) => {
        const response = await request(app).post("/api/customers").auth(token, { type: "bearer" }).send(fields);
        expect(response.status).toBe(422);
        expectFailure(response);
        expect(response.body.errors[field]).toEqual(expect.any(Array));
        expect(response.body.errors[field].length).toBeGreaterThan(0);
        for (const error of response.body.errors[field]) expect(error).toEqual(expect.any(String));
    });

    it("permits repeated customer names with distinct IDs", async () => {
        const name = `Repeated ${randomUUID()}`;
        const ids: number[] = [];
        for (let index = 0; index < 2; index++) {
            const response = await request(app).post("/api/customers").auth(token, { type: "bearer" }).send({ name });
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({ success: true, message: "OK", data: { id: expect.any(Number), name } });
            expect(response.body.data.id).toBeGreaterThan(0);
            ids.push(response.body.data.id);
        }
        expect(ids[0]).not.toBe(ids[1]);
    });

    it.each(["get", "post"] as const)("requires authentication for %s customers", async (method) => {
        const call = request(app)[method]("/api/customers");
        const response = await (method === "get" ? call : call.send({ name: `Unauthorized ${randomUUID()}` }));
        expect(response.status).toBe(401);
        expectFailure(response);
    });
});

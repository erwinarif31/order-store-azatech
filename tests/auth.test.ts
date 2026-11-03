import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = "auth-tests-only-secret-at-least-32-characters";

const id = randomUUID();
const email = `auth-${id}@example.com`;
const password = "TestPassword123!";
let app: typeof import("../src/app").app;
let db: typeof import("../src/db").db;
let token: string;

beforeAll(async () => {
    ({ app } = await import("../src/app"));
    ({ db } = await import("../src/db"));
    await db.user.create({
        data: { id, email, name: "Auth Test", passwordHash: await bcrypt.hash(password, 12) },
    });
    token = jwt.sign({}, process.env.JWT_SECRET!, { subject: id, expiresIn: "1h", algorithm: "HS256" });
});

afterAll(async () => {
    if (db) {
        await db.user.deleteMany({ where: { id } });
        await db.$disconnect();
    }
});

describe("auth API with PostgreSQL", () => {
    it("logs in and returns a signed token and safe user", async () => {
        const response = await request(app).post("/api/login").send({ email, password });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "OK",
            data: { token: expect.any(String), user: { id, name: "Auth Test", email } },
        });
        const claims = jwt.verify(response.body.data.token, process.env.JWT_SECRET!, { algorithms: ["HS256"] });
        expect(claims).toMatchObject({ sub: id, exp: expect.any(Number) });
        const me = await request(app).get("/api/me").auth(response.body.data.token, { type: "bearer" });
        expect(me.status).toBe(200);
        expect(me.body.data.user).toEqual({ id, name: "Auth Test", email });
    });

    it("returns identical failures for unknown email and wrong password", async () => {
        const wrong = await request(app).post("/api/login").send({ email, password: "wrong" });
        const missing = await request(app).post("/api/login").send({ email: `missing-${email}`, password });
        expect(wrong.status).toBe(401);
        expect(missing.status).toBe(401);
        expect(wrong.body).toEqual({ success: false, message: "Invalid email or password", errors: {} });
        expect(missing.body).toEqual(wrong.body);
    });

    it("returns field errors for invalid input", async () => {
        const response = await request(app).post("/api/login").send({ email: "invalid", password: "" });
        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
        expect(response.body.errors.email).toEqual(expect.any(Array));
        expect(response.body.errors.password).toEqual(expect.any(Array));
    });

    it("rejects passwords beyond bcrypt's UTF-8 byte limit", async () => {
        const response = await request(app).post("/api/login").send({ email, password: "é".repeat(37) });
        expect(response.status).toBe(422);
        expect(response.body.errors.password).toEqual(expect.any(Array));
    });

    it("returns the failure envelope for malformed JSON", async () => {
        const response = await request(app).post("/api/login").set("Content-Type", "application/json").send('{"email":');
        expect(response.status).toBe(422);
        expect(response.body).toEqual({ success: false, message: "Invalid JSON body", errors: { body: ["Invalid JSON"] } });
    });

    it("rejects oversized bodies without exposing internals", async () => {
        const response = await request(app).post("/api/login").send({ email, password: "a".repeat(17000) });
        expect(response.status).toBe(413);
        expect(response.body).toEqual({ success: false, message: "Request body too large", errors: {} });
    });

    it.each([undefined, "Basic abc", "Bearer invalid", "Bearer token extra"])("rejects missing or malformed authorization: %s", async (authorization) => {
        const call = request(app).get("/api/me");
        if (authorization) call.set("Authorization", authorization);
        const response = await call;
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, message: "Unauthorized", errors: {} });
    });

    it.each([
        { subject: id, expiresIn: -1, algorithm: "HS256" as const },
        { subject: id, expiresIn: 3600, algorithm: "HS384" as const },
        { subject: "invalid-id", expiresIn: 3600, algorithm: "HS256" as const },
    ])("rejects invalid JWT claims or algorithm: %j", async (options) => {
        const invalid = jwt.sign({}, process.env.JWT_SECRET!, options);
        const response = await request(app).get("/api/me").auth(invalid, { type: "bearer" });
        expect(response.status).toBe(401);
    });

    it("rejects a token signed by another secret", async () => {
        const invalid = jwt.sign({}, "a-different-secret", { subject: id });
        expect((await request(app).get("/api/me").auth(invalid, { type: "bearer" })).status).toBe(401);
    });

    it("rejects a valid token for a nonexistent user", async () => {
        const invalid = jwt.sign({}, process.env.JWT_SECRET!, { subject: randomUUID(), expiresIn: "1h" });
        expect((await request(app).get("/api/me").auth(invalid, { type: "bearer" })).status).toBe(401);
    });

    it("protects other API routes before returning 404", async () => {
        expect((await request(app).get("/api/products")).status).toBe(401);
        const response = await request(app).get("/api/products").auth(token, { type: "bearer" });
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Route not found", errors: {} });
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "../src/modules/auth/auth.service";
import { AppError } from "../src/shared/error";

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    compare: vi.fn(),
    sign: vi.fn(),
}));

vi.mock("../src/db", () => ({ db: { user: { findUnique: mocks.findUnique } } }));
vi.mock("../src/config", () => ({ config: { JWT_SECRET: "unit-test-secret" } }));
vi.mock("bcrypt", () => ({ default: { compare: mocks.compare } }));
vi.mock("jsonwebtoken", () => ({ default: { sign: mocks.sign } }));

const input = { email: "user@example.com", password: "submitted-password" };
const user = { id: "user-id", name: "Test User", email: input.email, passwordHash: "stored-hash" };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue(user);
    mocks.compare.mockResolvedValue(true);
    mocks.sign.mockReturnValue("signed-token");
});

describe("login service", () => {
    it("signs a token and returns only safe user fields", async () => {
        const result = await login(input);

        expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { email: input.email } });
        expect(mocks.compare).toHaveBeenCalledExactlyOnceWith(input.password, user.passwordHash);
        expect(mocks.sign).toHaveBeenCalledExactlyOnceWith({}, "unit-test-secret", {
            subject: user.id,
            algorithm: "HS256",
            expiresIn: "1h",
        });
        expect(result).toEqual({
            token: "signed-token",
            user: { id: user.id, name: user.name, email: user.email },
        });
        expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("rejects an unknown user without comparing or signing", async () => {
        mocks.findUnique.mockResolvedValue(null);

        const result = login(input);
        await expect(result).rejects.toBeInstanceOf(AppError);
        await expect(result).rejects.toMatchObject({ statusCode: 401, message: "Invalid email or password" });
        expect(mocks.compare).not.toHaveBeenCalled();
        expect(mocks.sign).not.toHaveBeenCalled();
    });

    it("rejects a wrong password without signing", async () => {
        mocks.compare.mockResolvedValue(false);

        const result = login(input);
        await expect(result).rejects.toBeInstanceOf(AppError);
        await expect(result).rejects.toMatchObject({ statusCode: 401, message: "Invalid email or password" });
        expect(mocks.sign).not.toHaveBeenCalled();
    });

    it("propagates lookup errors without comparing or signing", async () => {
        const error = new Error("Lookup failed");
        mocks.findUnique.mockRejectedValue(error);

        await expect(login(input)).rejects.toBe(error);
        expect(mocks.compare).not.toHaveBeenCalled();
        expect(mocks.sign).not.toHaveBeenCalled();
    });

    it("propagates bcrypt rejections without signing", async () => {
        const error = new Error("Comparison failed");
        mocks.compare.mockRejectedValue(error);

        await expect(login(input)).rejects.toBe(error);
        expect(mocks.sign).not.toHaveBeenCalled();
    });

    it("propagates JWT signing errors", async () => {
        const error = new Error("Signing failed");
        mocks.sign.mockImplementation(() => { throw error; });

        await expect(login(input)).rejects.toBe(error);
    });
});

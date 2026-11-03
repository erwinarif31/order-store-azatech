import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomer, listCustomers } from "../src/modules/customers/customers.service";
import { createCustomerSchema } from "../src/modules/customers/customers.schema";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn() }));

vi.mock("../src/db", () => ({ db: { customer: mocks } }));

const select = { id: true, name: true, email: true, phone: true };
const input = { name: "Customer", email: "customer@example.com", phone: "12345" };
const customer = { id: 1, ...input };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.findMany.mockResolvedValue([customer]);
    mocks.create.mockResolvedValue(customer);
});

describe("customer services", () => {
    it("lists selected public fields in stable ID order", async () => {
        expect(await listCustomers()).toEqual([customer]);
        expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({ select, orderBy: { id: "asc" } });
    });

    it("creates with only the public fields selected", async () => {
        expect(await createCustomer(input)).toEqual(customer);
        expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ data: input, select });
    });

    it("supports name-only creation", async () => {
        const minimal = { name: "Customer" };
        mocks.create.mockResolvedValue({ id: 2, ...minimal, email: null, phone: null });

        expect(await createCustomer(minimal)).toEqual({ id: 2, ...minimal, email: null, phone: null });
        expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ data: minimal, select });
    });

    it("allows repeated names and email without a uniqueness preflight", async () => {
        mocks.create.mockResolvedValueOnce(customer).mockResolvedValueOnce({ ...customer, id: 2 });

        expect(await createCustomer(input)).toEqual(customer);
        expect(await createCustomer(input)).toEqual({ ...customer, id: 2 });
        expect(mocks.create).toHaveBeenCalledTimes(2);
        expect(mocks.findMany).not.toHaveBeenCalled();
    });

    it("propagates database errors without inventing conflict handling", async () => {
        const error = new Error("Database failed");
        mocks.findMany.mockRejectedValue(error);
        mocks.create.mockRejectedValue(error);

        await expect(listCustomers()).rejects.toBe(error);
        await expect(createCustomer(input)).rejects.toBe(error);
    });
});

describe("customer input schema", () => {
    it("accepts name-only and full inputs, trimming name and phone", () => {
        expect(createCustomerSchema.parse({ name: " Customer " })).toEqual({ name: "Customer" });
        expect(createCustomerSchema.parse({ ...input, name: " Customer ", phone: " 12345 " })).toEqual(input);
    });

    it("rejects missing or blank names and invalid email", () => {
        for (const value of [{}, { name: " " }, { ...input, email: "invalid" }, { ...input, email: "" }]) {
            expect(createCustomerSchema.safeParse(value).success).toBe(false);
        }
    });

    it("enforces database string bounds", () => {
        const maxEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
        expect(maxEmail).toHaveLength(254);
        expect(createCustomerSchema.safeParse({
            name: "x".repeat(120), email: maxEmail, phone: "1".repeat(30),
        }).success).toBe(true);
        for (const patch of [
            { name: "x".repeat(121) },
            { email: `${maxEmail}d` },
            { phone: "1".repeat(31) },
        ]) {
            expect(createCustomerSchema.safeParse({ ...input, ...patch }).success).toBe(false);
        }
    });
});

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProduct, listProducts, updateProduct } from "../src/modules/products/products.service";
import {
    createProductSchema,
    listProductsSchema,
    productIdSchema,
    updateProductSchema,
} from "../src/modules/products/products.schema";
import { AppError } from "../src/shared/error";

const mocks = vi.hoisted(() => ({
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
}));

vi.mock("../src/db", () => ({ db: { product: mocks } }));

const input = { product_code: "SKU-1", name: "Product", price: 999999999999999, stock: 0 };
const product = {
    id: 1,
    productCode: input.product_code,
    name: input.name,
    price: new Prisma.Decimal(input.price),
    stock: input.stock,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const dto = { id: product.id, ...input, price: product.price };
const data = { productCode: input.product_code, name: input.name, price: input.price, stock: input.stock };

function prismaError(code: string) {
    return new Prisma.PrismaClientKnownRequestError("Database error", { code, clientVersion: "7.10.1" });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.findMany.mockResolvedValue([product]);
    mocks.count.mockResolvedValue(1);
    mocks.create.mockResolvedValue(product);
    mocks.update.mockResolvedValue(product);
});

describe("product services", () => {
    it("lists with parsed default pagination and explicit API fields", async () => {
        const result = await listProducts(listProductsSchema.parse({}));

        expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({
            where: {}, skip: 0, take: 10, orderBy: { id: "asc" },
        });
        expect(mocks.count).toHaveBeenCalledExactlyOnceWith({ where: {} });
        expect(result).toEqual({ data: [dto], meta: { page: 1, per_page: 10, total: 1 } });
        expect(result.data[0]).not.toHaveProperty("productCode");
        expect(result.data[0]).not.toHaveProperty("createdAt");
        expect(result.data[0].price).toBe(product.price);
        expect(JSON.parse(JSON.stringify(result.data[0])).price).toBe("999999999999999");
    });

    it("shares search filters between data and count and applies pagination", async () => {
        const result = await listProducts(listProductsSchema.parse({ page: "3", per_page: "5", search: " SKU " }));
        const where = { OR: [
            { name: { contains: "SKU", mode: "insensitive" } },
            { productCode: { contains: "SKU", mode: "insensitive" } },
        ] };

        expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({
            where, skip: 10, take: 5, orderBy: { id: "asc" },
        });
        expect(mocks.count).toHaveBeenCalledExactlyOnceWith({ where });
        expect(mocks.findMany.mock.calls[0][0].where).toBe(mocks.count.mock.calls[0][0].where);
        expect(result.meta).toEqual({ page: 3, per_page: 5, total: 1 });
    });

    it("maps create input and serializes the result without a preflight", async () => {
        expect(await createProduct(input)).toEqual(dto);
        expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ data });
        expect(mocks.findMany).not.toHaveBeenCalled();
        expect(mocks.count).not.toHaveBeenCalled();
    });

    it("maps the full update payload and integer ID", async () => {
        expect(await updateProduct(1, input)).toEqual(dto);
        expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 1 }, data });
    });

    it.each(["create", "update"] as const)("maps duplicate %s to a 409 field error", async (operation) => {
        mocks[operation].mockRejectedValue(prismaError("P2002"));
        const result = operation === "create" ? createProduct(input) : updateProduct(1, input);

        await expect(result).rejects.toBeInstanceOf(AppError);
        await expect(result).rejects.toMatchObject({
            statusCode: 409,
            message: "Product code already exists",
            errors: { product_code: ["Product code already exists"] },
        });
    });

    it("maps a missing update to 404", async () => {
        mocks.update.mockRejectedValue(prismaError("P2025"));
        const result = updateProduct(1, input);

        await expect(result).rejects.toBeInstanceOf(AppError);
        await expect(result).rejects.toMatchObject({ statusCode: 404, message: "Product not found" });
    });

    it("propagates unknown write errors, including code lookalikes", async () => {
        for (const error of [new Error("Write failed"), prismaError("P2003"), { code: "P2002" }]) {
            mocks.create.mockRejectedValue(error);
            mocks.update.mockRejectedValue(error);
            await expect(createProduct(input)).rejects.toBe(error);
            await expect(updateProduct(1, input)).rejects.toBe(error);
        }
    });

    it("propagates list and count errors", async () => {
        const error = new Error("Read failed");
        mocks.findMany.mockRejectedValueOnce(error);
        await expect(listProducts(listProductsSchema.parse({}))).rejects.toBe(error);
        mocks.count.mockRejectedValueOnce(error);
        await expect(listProducts(listProductsSchema.parse({}))).rejects.toBe(error);
    });
});

describe("product input schemas", () => {
    it("defaults pagination and search and trims search", () => {
        expect(listProductsSchema.parse({})).toEqual({ page: 1, per_page: 10, search: "" });
        expect(listProductsSchema.parse({ search: "  bolt  " }).search).toBe("bolt");
    });

    it("rejects invalid pagination including unsafe offsets", () => {
        for (const query of [
            { page: 0 }, { page: 1.5 }, { page: "bad" },
            { per_page: 0 }, { per_page: 101 }, { per_page: 1.5 },
            { page: Number.MAX_SAFE_INTEGER, per_page: 100 },
        ]) {
            expect(listProductsSchema.safeParse(query).success).toBe(false);
        }
    });

    it("trims required strings and accepts stock zero and database upper bounds", () => {
        expect(createProductSchema.parse({ ...input, product_code: " SKU-1 ", name: " Product " })).toEqual(input);
        expect(createProductSchema.safeParse({ ...input, stock: 2147483647 }).success).toBe(true);
    });

    it("requires the same full payload for create and update", () => {
        for (const schema of [createProductSchema, updateProductSchema]) {
            for (const field of Object.keys(input)) {
                const partial: Record<string, unknown> = { ...input };
                delete partial[field];
                expect(schema.safeParse(partial).success).toBe(false);
            }
        }
    });

    it("rejects blank or oversized product strings", () => {
        for (const patch of [
            { product_code: " " }, { product_code: "x".repeat(51) },
            { name: " " }, { name: "x".repeat(201) },
        ]) {
            expect(createProductSchema.safeParse({ ...input, ...patch }).success).toBe(false);
        }
    });

    it("rejects nonpositive, fractional, nonnumeric and out-of-range prices", () => {
        for (const price of [0, -1, 1.5, 1000000000000000, "1"]) {
            expect(createProductSchema.safeParse({ ...input, price }).success).toBe(false);
        }
    });

    it("rejects negative, fractional, nonnumeric and out-of-range stock", () => {
        for (const stock of [-1, 0.5, 2147483648, "0"]) {
            expect(createProductSchema.safeParse({ ...input, stock }).success).toBe(false);
        }
    });

    it("coerces positive integer IDs within the database bound", () => {
        expect(productIdSchema.parse("1")).toBe(1);
        expect(productIdSchema.parse("2147483647")).toBe(2147483647);
        for (const id of [0, -1, 1.5, "bad", 2147483648]) {
            expect(productIdSchema.safeParse(id).success).toBe(false);
        }
    });
});

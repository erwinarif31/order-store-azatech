import { Prisma, type Product } from "@prisma/client";
import { db } from "../../db";
import { AppError } from "../../shared/error";
import { parsePagination } from "../../shared/pagination";
import type { CreateProductInput, ListProductsInput, UpdateProductInput } from "./products.schema";

function serializeProduct(product: Product) {
    return {
        id: product.id,
        product_code: product.productCode,
        name: product.name,
        price: product.price,
        stock: product.stock,
    };
}

export async function listProducts(input: ListProductsInput) {
    const { page, per_page, skip, take } = parsePagination(input);
    const where: Prisma.ProductWhereInput = input.search ? {
        OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { productCode: { contains: input.search, mode: "insensitive" } },
        ],
    } : {};
    const [products, total] = await Promise.all([
        db.product.findMany({ where, skip, take, orderBy: { id: "asc" } }),
        db.product.count({ where }),
    ]);

    return { data: products.map(serializeProduct), meta: { page, per_page, total } };
}

export async function createProduct(input: CreateProductInput) {
    try {
        const product = await db.product.create({
            data: {
                productCode: input.product_code,
                name: input.name,
                price: input.price,
                stock: input.stock,
            },
        });
        return serializeProduct(product);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new AppError("Product code already exists", 409, {
                product_code: ["Product code already exists"],
            });
        }
        throw error;
    }
}

export async function updateProduct(id: number, input: UpdateProductInput) {
    try {
        const product = await db.product.update({
            where: { id },
            data: {
                productCode: input.product_code,
                name: input.name,
                price: input.price,
                stock: input.stock,
            },
        });
        return serializeProduct(product);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2002") {
                throw new AppError("Product code already exists", 409, {
                    product_code: ["Product code already exists"],
                });
            }
            if (error.code === "P2025") throw new AppError("Product not found", 404);
        }
        throw error;
    }
}

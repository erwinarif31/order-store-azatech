import { createHash } from "node:crypto";
import { Prisma, type OrderStatus } from "@prisma/client";
import { db } from "../../db";
import { AppError, type FieldErrors } from "../../shared/error";
import { parsePagination } from "../../shared/pagination";
import { calculatePricing } from "./pricing";
import type { CreateOrderInput, ListOrdersInput } from "./orders.schema";

const include = { items: { orderBy: { id: "asc" as const } }, customer: { select: { id: true, name: true, email: true, phone: true } } };
type FullOrder = Prisma.OrderGetPayload<{ include: typeof include }>;
type LockedProduct = { id: number; product_code: string; name: string; price: Prisma.Decimal; stock: number };
const transactionOptions = { maxWait: 10000, timeout: 10000 };

function serializeOrder(order: FullOrder) {
    return {
        id: order.id, order_number: order.orderNumber, customer_id: order.customerId,
        status: order.status, subtotal: order.subtotal, discount_amount: order.discountAmount,
        grand_total: order.grandTotal, created_at: order.createdAt, updated_at: order.updatedAt,
        customer: order.customer,
        items: order.items.map((item) => ({
            id: item.id, product_id: item.productId, product_code: item.productCode,
            product_name: item.productName, quantity: item.quantity, unit_price: item.unitPrice, subtotal: item.subtotal,
        })),
    };
}

export async function createOrder(input: CreateOrderInput, idempotencyKey?: string) {
    const sortedItems = [...input.items].sort((a, b) => a.product_id - b.product_id);
    const payloadHash = createHash("sha256").update(JSON.stringify({ customer_id: input.customer_id, items: sortedItems })).digest("hex");
    return db.$transaction(async (tx) => {
        if (idempotencyKey !== undefined) {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))::text`;
            const existing = await tx.order.findUnique({ where: { idempotencyKey }, include });
            if (existing) {
                if (existing.payloadHash !== payloadHash) throw new AppError("Idempotency key was used for a different payload", 409);
                return { order: serializeOrder(existing), replayed: true };
            }
        }
        if (!await tx.customer.findUnique({ where: { id: input.customer_id }, select: { id: true } })) {
            throw new AppError("Customer not found", 422, { customer_id: ["Customer not found"] });
        }
        const products = await tx.$queryRaw<LockedProduct[]>`SELECT id, product_code, name, price, stock FROM products WHERE id IN (${Prisma.join(sortedItems.map((item) => item.product_id))}) ORDER BY id FOR UPDATE`;
        const byId = new Map(products.map((product) => [product.id, product]));
        const errors: FieldErrors = {};
        input.items.forEach((item, index) => {
            const product = byId.get(item.product_id);
            if (!product) errors[`items.${index}.product_id`] = ["Product not found"];
            else if (product.stock < item.quantity) errors[`items.${index}.quantity`] = [`Insufficient stock: remaining ${product.stock}, requested ${item.quantity}`];
        });
        if (Object.keys(errors).length) throw new AppError("Invalid order items", 422, errors);
        const pricing = calculatePricing(input.items.map((item) => ({ unitPrice: byId.get(item.product_id)!.price, quantity: item.quantity })));
        const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
        const counter = await tx.invoiceCounter.upsert({ where: { day }, create: { day, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
        if (counter.lastNumber > 9999) throw new AppError("Daily invoice capacity reached", 409);
        for (const item of sortedItems) {
            await tx.product.update({ where: { id: item.product_id }, data: { stock: { decrement: item.quantity } } });
        }
        const order = await tx.order.create({
            data: {
                orderNumber: `INV-${day}-${String(counter.lastNumber).padStart(4, "0")}`,
                customerId: input.customer_id, subtotal: pricing.subtotal,
                discountAmount: pricing.discountAmount, grandTotal: pricing.grandTotal,
                ...(idempotencyKey !== undefined ? { idempotencyKey, payloadHash } : {}),
                items: { create: input.items.map((item, index) => {
                    const product = byId.get(item.product_id)!;
                    return { productId: product.id, productCode: product.product_code, productName: product.name, quantity: item.quantity, unitPrice: product.price, subtotal: pricing.itemSubtotals[index]! };
                }) },
            }, include,
        });
        return { order: serializeOrder(order), replayed: false };
    }, transactionOptions);
}

export async function changeOrderStatus(id: number, status: "PAID" | "CANCELLED") {
    return db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: number; status: OrderStatus }[]>`SELECT id, status FROM orders WHERE id = ${id} FOR UPDATE`;
        const current = rows[0];
        if (!current) throw new AppError("Order not found", 404);
        if (current.status === "CANCELLED" || (status === "PAID" && current.status !== "PENDING")) {
            throw new AppError(`Cannot change ${current.status} order to ${status}`, 409);
        }
        if (status === "CANCELLED") {
            const items = await tx.orderItem.findMany({ where: { orderId: id }, orderBy: { productId: "asc" } });
            const products = await tx.$queryRaw<{ id: number; stock: number }[]>`SELECT id, stock FROM products WHERE id IN (${Prisma.join(items.map((item) => item.productId))}) ORDER BY id FOR UPDATE`;
            const stocks = new Map(products.map((product) => [product.id, product.stock]));
            for (const item of items) {
                if (stocks.get(item.productId)! + item.quantity > 2147483647) throw new AppError("Cannot restore stock beyond maximum supported quantity", 409);
            }
            for (const item of items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
        return serializeOrder(await tx.order.update({ where: { id }, data: { status }, include }));
    }, transactionOptions);
}

export async function getOrder(id: number) {
    const order = await db.order.findUnique({ where: { id }, include });
    if (!order) throw new AppError("Order not found", 404);
    return serializeOrder(order);
}

export async function listOrders(input: ListOrdersInput) {
    const { page, per_page, skip, take } = parsePagination(input);
    const until = input.date_to ? new Date(`${input.date_to}T00:00:00.000Z`) : undefined;
    if (until) until.setUTCDate(until.getUTCDate() + 1);
    const where: Prisma.OrderWhereInput = {
        ...(input.status ? { status: input.status } : {}),
        ...(input.date_from || until ? { createdAt: { ...(input.date_from ? { gte: new Date(`${input.date_from}T00:00:00.000Z`) } : {}), ...(until ? { lt: until } : {}) } } : {}),
    };
    const [orders, total] = await Promise.all([
        db.order.findMany({ where, include, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
        db.order.count({ where }),
    ]);
    return { data: orders.map(serializeOrder), meta: { page, per_page, total } };
}

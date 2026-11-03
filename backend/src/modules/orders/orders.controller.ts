import type { Request, Response } from "express";
import { createResponse } from "../../shared/response";
import { createOrderSchema, idempotencyKeySchema, listOrdersSchema, orderIdSchema } from "./orders.schema";
import * as orders from "./orders.service";

export async function createOrder(req: Request, res: Response) {
    const key = idempotencyKeySchema.parse(req.headers["idempotency-key"]);
    const { order, replayed } = await orders.createOrder(createOrderSchema.parse(req.body), key);
    res.status(replayed ? 200 : 201).json(createResponse(order));
}
export async function listOrders(req: Request, res: Response) {
    const { data, meta } = await orders.listOrders(listOrdersSchema.parse(req.query));
    res.json(createResponse(data, meta));
}
export async function getOrder(req: Request, res: Response) {
    const { id } = orderIdSchema.parse(req.params);
    res.json(createResponse(await orders.getOrder(id)));
}
export async function payOrder(req: Request, res: Response) {
    const { id } = orderIdSchema.parse(req.params);
    res.json(createResponse(await orders.changeOrderStatus(id, "PAID")));
}
export async function cancelOrder(req: Request, res: Response) {
    const { id } = orderIdSchema.parse(req.params);
    res.json(createResponse(await orders.changeOrderStatus(id, "CANCELLED")));
}

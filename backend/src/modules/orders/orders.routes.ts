import { Router } from "express";
import { createOrder, listOrders, getOrder, payOrder, cancelOrder } from "./orders.controller";

export const ordersRouter = Router();
ordersRouter.post("/orders", createOrder);
ordersRouter.get("/orders", listOrders);
ordersRouter.get("/orders/:id", getOrder);
ordersRouter.patch("/orders/:id/pay", payOrder);
ordersRouter.patch("/orders/:id/cancel", cancelOrder);

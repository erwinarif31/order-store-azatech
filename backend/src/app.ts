import express from "express";
import cors from "cors";
import { config } from "./config";
import { authMiddleware } from "./middleware/auth.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import { authRouter, loginRouter } from "./modules/auth/auth.routes";
import { AppError } from "./shared/error";
import { productsRouter } from "./modules/products/products.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { ordersRouter } from "./modules/orders/orders.routes";

export const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.FRONTEND_URL }));
app.use(express.json({ limit: "16kb" }));
app.use("/api", loginRouter);
app.use("/api", authMiddleware, authRouter, productsRouter, customersRouter, ordersRouter);
app.use((_req, _res, next) => next(new AppError("Route not found", 404)));
app.use(errorMiddleware);

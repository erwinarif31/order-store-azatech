import { Router } from "express";
import { createProduct, listProducts, updateProduct } from "./products.controller";

export const productsRouter = Router();
productsRouter.get("/products", listProducts);
productsRouter.post("/products", createProduct);
productsRouter.put("/products/:id", updateProduct);

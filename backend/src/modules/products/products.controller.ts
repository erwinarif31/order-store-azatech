import type { Request, Response } from "express";
import { z } from "zod";
import { createResponse } from "../../shared/response";
import { createProductSchema, updateProductSchema, listProductsSchema, productIdSchema } from "./products.schema";
import * as products from "./products.service";

export async function listProducts(req: Request, res: Response) {
    const { data, meta } = await products.listProducts(listProductsSchema.parse(req.query));
    res.json(createResponse(data, meta));
}
export async function createProduct(req: Request, res: Response) {
    res.status(201).json(createResponse(await products.createProduct(createProductSchema.parse(req.body))));
}
export async function updateProduct(req: Request, res: Response) {
    const { id } = z.object({ id: productIdSchema }).parse(req.params);
    res.json(createResponse(await products.updateProduct(id, updateProductSchema.parse(req.body))));
}

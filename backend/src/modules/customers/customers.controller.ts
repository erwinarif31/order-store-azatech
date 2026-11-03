import type { Request, Response } from "express";
import { createResponse } from "../../shared/response";
import { createCustomerSchema } from "./customers.schema";
import * as customers from "./customers.service";

export async function listCustomers(_req: Request, res: Response) {
    res.json(createResponse(await customers.listCustomers()));
}
export async function createCustomer(req: Request, res: Response) {
    res.status(201).json(createResponse(await customers.createCustomer(createCustomerSchema.parse(req.body))));
}

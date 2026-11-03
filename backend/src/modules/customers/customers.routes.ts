import { Router } from "express";
import { createCustomer, listCustomers } from "./customers.controller";

export const customersRouter = Router();
customersRouter.get("/customers", listCustomers);
customersRouter.post("/customers", createCustomer);

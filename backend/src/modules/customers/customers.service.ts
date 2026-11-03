import { db } from "../../db";
import type { CreateCustomerInput } from "./customers.schema";

const publicCustomer = { id: true, name: true, email: true, phone: true } as const;

export async function listCustomers() {
    return db.customer.findMany({ select: publicCustomer, orderBy: { id: "asc" } });
}

export async function createCustomer(input: CreateCustomerInput) {
    return db.customer.create({ data: input, select: publicCustomer });
}

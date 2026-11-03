import type { Request, Response } from "express";
import { createResponse } from "../../shared/response";
import { loginSchema } from "./auth.schema";
import { getCurrentUser, login } from "./auth.service";

export async function loginController(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    res.json(createResponse(await login(input)));
}

export async function getCurrentUserController(_req: Request, res: Response) {
    const user = await getCurrentUser(res.locals.userId);
    res.json(createResponse({ user }));
}

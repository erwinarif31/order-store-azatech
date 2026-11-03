import { Router } from "express";
import { createResponse } from "../../shared/response";
import { loginSchema } from "./auth.schema";
import { getCurrentUser, login } from "./auth.service";

export const loginRouter = Router();
export const authRouter = Router();

loginRouter.post("/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    res.json(createResponse(await login(input)));
});

authRouter.get("/me", async (_req, res) => {
    const user = await getCurrentUser(res.locals.userId);
    res.json(createResponse({ user }));
});

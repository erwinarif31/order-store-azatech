import { Router } from "express";
import { getCurrentUserController, loginController } from "./auth.controller";

export const loginRouter = Router();
export const authRouter = Router();

loginRouter.post("/login", loginController);
authRouter.get("/me", getCurrentUserController);

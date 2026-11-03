import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config";
import { AppError } from "../shared/error";

const claimsSchema = z.object({ sub: z.string().uuid() });

export const authMiddleware: RequestHandler = (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? "");
    if (!match) {
        next(new AppError("Unauthorized", 401));
        return;
    }

    try {
        const claims = claimsSchema.parse(jwt.verify(match[1], config.JWT_SECRET, {
            algorithms: ["HS256"],
        }));
        res.locals.userId = claims.sub;
    } catch {
        next(new AppError("Unauthorized", 401));
        return;
    }
    next();
};

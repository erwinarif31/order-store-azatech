import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { db } from "../../db";
import { AppError } from "../../shared/error";
import type { LoginInput } from "./auth.schema";

const publicUser = { id: true, name: true, email: true } as const;

export async function login(input: LoginInput) {
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (!user || !await bcrypt.compare(input.password, user.passwordHash)) {
        throw new AppError("Invalid email or password", 401);
    }

    const token = jwt.sign({}, config.JWT_SECRET, {
        subject: user.id,
        algorithm: "HS256",
        expiresIn: "1h",
    });

    return { token, user: { id: user.id, name: user.name, email: user.email } };
}

export async function getCurrentUser(id: string) {
    const user = await db.user.findUnique({ where: { id }, select: publicUser });
    if (!user) throw new AppError("Unauthorized", 401);
    return user;
}

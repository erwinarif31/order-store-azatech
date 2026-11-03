import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, type FieldErrors } from "../shared/error";

export const errorMiddleware: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    let appError: AppError;
    if (error instanceof AppError) {
        appError = error;
    } else if (error instanceof ZodError) {
        const errors: FieldErrors = {};
        for (const issue of error.issues) {
            const field = issue.path.join(".") || "body";
            (errors[field] ??= []).push(issue.message);
        }
        appError = new AppError("Validation failed", 422, errors);
    } else if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
        appError = new AppError("Invalid JSON body", 422, { body: ["Invalid JSON"] });
    } else if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
        appError = new AppError("Request body too large", 413);
    } else {
        console.error(error);
        appError = new AppError("Internal server error", 500);
    }

    res.status(appError.statusCode).json({
        success: false,
        message: appError.message,
        errors: appError.errors,
    });
};

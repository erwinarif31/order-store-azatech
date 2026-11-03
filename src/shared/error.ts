export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly errors: FieldErrors = {},
    ) {
        super(message);
    }
}

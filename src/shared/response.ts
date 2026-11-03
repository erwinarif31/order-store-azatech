import type { PaginationMeta } from "./pagination";

export function createResponse<T>(data: T, meta?: PaginationMeta) {
    return {
        success: true,
        message: "OK",
        data,
        ...(meta ? { meta } : {}),
    };
}

import { PrismaClient } from "@prisma/client";
import { config } from "./config";

export const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });

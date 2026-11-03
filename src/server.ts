import { app } from "./app";
import { config } from "./config";
import { db } from "./db";

async function start() {
    await db.$connect();
    const server = app.listen(config.PORT, () => {
        console.log(`Backend listening on port ${config.PORT}`);
    });
    server.on("error", async (error) => {
        console.error(error);
        await db.$disconnect();
        process.exitCode = 1;
    });

    const shutdown = () => {
        server.close(async () => {
            await db.$disconnect();
        });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

start().catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exitCode = 1;
});

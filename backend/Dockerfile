FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && exec node dist/server.js"]

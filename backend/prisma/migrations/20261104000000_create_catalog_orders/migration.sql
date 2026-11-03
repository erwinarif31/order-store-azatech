CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "products" (
    "id" SERIAL PRIMARY KEY,
    "product_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "price" DECIMAL(15,0) NOT NULL CHECK (price > 0),
    "stock" INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "products_product_code_key" ON "products"("product_code");

CREATE TABLE "customers" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "orders" (
    "id" SERIAL PRIMARY KEY,
    "order_number" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(30,2) NOT NULL CHECK (subtotal >= 0),
    "discount_amount" DECIMAL(30,2) NOT NULL CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
    "grand_total" DECIMAL(30,2) NOT NULL CHECK (grand_total >= 0 AND grand_total = subtotal - discount_amount),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "idempotency_key" VARCHAR(200),
    "payload_hash" VARCHAR(64),
    CONSTRAINT "orders_idempotency_pair_check" CHECK ((idempotency_key IS NULL) = (payload_hash IS NULL)),
    CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX "orders_created_at_id_idx" ON "orders"("created_at", "id");

CREATE TABLE "order_items" (
    "id" SERIAL PRIMARY KEY,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_code" VARCHAR(50) NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL CHECK (quantity > 0),
    "unit_price" DECIMAL(15,0) NOT NULL CHECK (unit_price > 0),
    "subtotal" DECIMAL(30,2) NOT NULL CHECK (subtotal = unit_price * quantity),
    CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

CREATE TABLE "invoice_counters" (
    "day" VARCHAR(8) PRIMARY KEY,
    "last_number" INTEGER NOT NULL CHECK (last_number > 0)
);

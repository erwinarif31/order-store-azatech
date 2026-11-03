# Order Service

Backend: TypeScript, Express, Prisma, PostgreSQL, JWT.
Frontend: Vue 3 dan Vite.

## Menjalankan aplikasi

Butuh Docker dengan Compose v2.

```sh
git clone https://github.com/erwinarif31/order-store-azatech.git azatech
cd azatech
cp .env.example .env
# Isi JWT_SECRET di .env dengan minimal 32 karakter acak sebelum perintah berikut.
docker compose up --build -d --wait
```

Buat nilai `JWT_SECRET` menggunakan `openssl rand -hex 32` jika OpenSSL tersedia, lalu salin hasilnya ke `.env`. Jangan commit `.env`.

- Frontend: http://localhost:8080
- API: http://localhost:3000/api
- Seeder login admin: `admin@example.com` / `Admin123!`

Compose otomatis menjalankan migrasi dan seed 1 admin, 15 produk, dan 10 pelanggan. Konfigurasi ini untuk penggunaan lokal. Data tetap tersimpan setelah `docker compose down`; **`docker compose down -v` menghapus data database.**

## Menjalankan test

Jalankan aplikasi terlebih dahulu. Gunakan database pengujian terpisah; jalankan `createdb` sekali saja, atau lewati jika database sudah ada.

```sh
docker compose exec db createdb -U postgres azatech_test
docker compose exec -e DATABASE_URL='postgresql://postgres:postgres@db:5432/azatech_test?schema=public' backend npm run db:migrate
docker compose exec -e TEST_DATABASE_URL='postgresql://postgres:postgres@db:5432/azatech_test?schema=public' backend npm test
```

Test frontend menggunakan tahap build Node:

```sh
docker build --target build -t azatech-frontend-tests ./frontend
docker run --rm azatech-frontend-tests npm test
```

## Alur `POST /api/orders`

Middleware memeriksa JWT, lalu `orders.routes.ts` memanggil controller untuk validasi dengan Zod. `createOrder()` di `backend/src/modules/orders/orders.service.ts` membuka transaksi, mengunci produk dengan `FOR UPDATE`, dan memeriksa stok. `pricing.ts` menghitung total dari harga database dengan diskon Varian A: 5% mulai Rp500.000 atau 10% mulai Rp1.000.000, maksimal Rp150.000. Service menyimpan snapshot item, order PENDING, invoice, dan pengurangan stok dalam transaksi yang sama; kegagalan membatalkan seluruh perubahan. Respons baru memakai 201, sedangkan retry dengan `Idempotency-Key` dan payload yang sama mengembalikan order tersimpan dengan 200 tanpa mengurangi stok lagi.

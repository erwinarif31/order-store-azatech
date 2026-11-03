# Keputusan Teknis

## 1. Bagaimana mencegah stok minus saat dua order masuk bersamaan?

Fungsi `createOrder()` melakukan row lock berdasarkan ID produk menggunakan `SELECT ... FOR UPDATE` dalam satu db transaction. Service memeriksa stok setelah lock, sehingga request berikutnya harus menunggu dan membaca stok terbaru setelah lock dilepas. Jika stok tidak cukup, permintaan mendapat respons 422; jika salah satu item gagal, seluruh perubahan dibatalkan karena terjadi pada satu db transaction. Database juga memiliki constraint `CHECK (stock >= 0)` sebagai constraint tambahan.

## 2. Mengapa struktur kode dibuat seperti ini, dan bagaimana jika aplikasi berkembang?

Berfokus pada architecture backend, saya membagi kode berdasarkan fitur di `backend/src/modules/`. Pada tiap fitur, routes menentukan endpoint, controller memvalidasi request dan mengembalikan response, sedangkan service bertanggung jawab untuk business logic dan akses Prisma. Alur endpoint terproteksi adalah `Request -> Middleware -> Route -> Controller -> Service -> Database`. Setiap layer tetap memiliki ketergantungan yang terarah, misalnya controller memanggil service, tetapi perubahan internal tidak selalu mengubah layer lain selama kontraknya tetap sama. Jika aplikasi membesar, repository dapat ditambahkan untuk memisahkan business logic dari detail query database.

## 3. Bug apa yang ditemui, dan bagaimana menemukannya?

Saat pengujian browser dengan bantuan AI, ditemukan kasus order berhasil tersimpan tetapi navigasi ke halaman detail gagal. Form masih bisa diedit, sehingga pengiriman ulang dengan idempotency key baru membuat order kedua. Perbaikan di `CreateOrderView.vue` memisahkan keberhasilan penyimpanan dari proses navigasi: setelah order tersimpan, form dikunci dan tombol retry hanya membuka detail order tersebut. Test regresi memastikan retry tidak mengirim POST tambahan.

## 4. Bagian apa yang masih perlu diperbaiki, dan apa langkah berikutnya?

Deployment menggunakan Docker masih terbatas untuk environment development. Langkah berikutnya adalah membuat pipeline sederhana untuk deployment dan menyesuaikan secret serta konfigurasi environment. Jika aplikasi semakin besar, layer repository dapat memisahkan service dari detail query database.

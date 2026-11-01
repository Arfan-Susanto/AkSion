# AkSion — Aksara Vision

AkSion adalah aplikasi web untuk mengenali **20 aksara dasar Jawa (Carakan)** menggunakan model machine learning. Pengguna dapat menggambar aksara, mengunggah gambar, atau mengambil foto melalui kamera. Hasil menampilkan aksara yang diprediksi, bunyinya, skor keyakinan, dan hingga tiga kandidat teratas.

## Spesifikasi

- **Backend:** Python dan Flask.
- **Antarmuka:** HTML, CSS, dan JavaScript. Seluruh teks antarmuka berbahasa Indonesia.
- **Model klasifikasi:** CNN `aksion_model.keras`.
- **Model pemeriksa input:** `aksion_gatekeeper.keras`, untuk membantu menolak gambar yang bukan aksara.
- **Pra-pemrosesan:** gambar didekode sebagai RGB, diubah ukurannya menjadi 66 × 66 piksel, dikonversi ke grayscale, lalu dinormalisasi ke rentang 0-1.
- **Kelas yang dikenali:** `ba`, `ca`, `da`, `dha`, `ga`, `ha`, `ja`, `ka`, `la`, `ma`, `na`, `nga`, `nya`, `pa`, `ra`, `sa`, `ta`, `tha`, `wa`, dan `ya`.
- **Batas input:** PNG, JPG/JPEG, atau WEBP; maksimal 5 MB per gambar dan 20 gambar per proses.
- **Privasi dan jaringan:** server dijalankan pada `127.0.0.1:5000`, sehingga hanya dapat diakses dari komputer yang menjalankannya secara default.

Model menggunakan ambang penolakan dari `config.json`. Input dapat ditolak sebagai bukan aksara atau sebagai tulisan yang kurang meyakinkan. Skor yang ditampilkan adalah probabilitas keluaran model, bukan jaminan bahwa prediksi benar. Nama kelas menunjukkan bunyi aksara, bukan arti kata.

### Evaluasi model

`config.json` mencatat metrik pengujian model klasifikasi: akurasi 96,11% dan F1 berbobot 96,13%. Pada pengujian dengan ambang penolakan, 90,56% aksara asli diterima, akurasi pada input yang diterima tercatat 99,39%. Angka ini berasal dari set pengujian proyek dan bukan jaminan untuk semua gambar atau tulisan pengguna.

## Struktur berkas

```text
.
├── app.py                    # Server web Flask dan API prediksi
├── predict_aksion.py         # Pra-pemrosesan dan inferensi model
├── config.json               # Konfigurasi model, kelas, dan ambang penolakan
├── labels.json               # Daftar kelas aksara
├── aksion_model.keras        # Model klasifikasi 20 aksara
├── aksion_gatekeeper.keras   # Model pemeriksa input aksara
├── requirements.txt          # Dependensi Python
├── templates/
│   └── index.html            # Halaman aplikasi
└── static/
    ├── script.js             # Interaksi gambar, upload, kamera, dan hasil
    └── style.css             # Tampilan dan tata letak
```

Kedua berkas model dan `config.json` harus tersedia di folder yang sama dengan `app.py`. Nama berkas model yang digunakan ditentukan di `config.json`.

## Persiapan dan menjalankan

Pastikan Python dan `pip` sudah terpasang. Dari PowerShell, jalankan perintah berikut di folder proyek:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Jika PowerShell mencegah aktivasi virtual environment, gunakan Python dari virtual environment secara langsung:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Saat server berjalan, buka **http://127.0.0.1:5000** di browser. Model dimuat saat server mulai; tunggu proses pemuatan selesai sebelum mengirim gambar. Hentikan server dengan `Ctrl+C` di terminal.

## Cara menggunakan

1. Buka bagian **studio** pada halaman.
2. Pilih salah satu metode input:
   - **Gambar:** coret satu aksara pada kanvas 66 × 66 piksel. Pilih ketebalan kuas, gunakan penghapus bila perlu, dan tambahkan kanvas untuk memproses beberapa aksara sekaligus.
   - **Upload:** pilih atau seret hingga 20 gambar PNG, JPG/JPEG, atau WEBP. Setiap gambar maksimal 5 MB.
   - **Kamera (beta):** izinkan akses kamera, posisikan satu aksara di dalam bingkai, lalu ambil foto. Foto yang diambil dipotong menjadi persegi dari bagian tengah dan diubah ke 66 × 66 piksel. Maksimal 20 foto per proses.
3. Tekan tombol prediksi pada metode yang dipilih.
4. Baca hasil yang muncul. Prediksi yang diterima menampilkan aksara dan bunyinya; hasil juga dapat memuat kandidat lain. Jika gambar ditolak atau gagal diproses, periksa pesan yang ditampilkan dan coba gambar yang lebih jelas.

Untuk hasil yang lebih baik, gunakan satu aksara yang besar, jelas, berada di tengah, dan memiliki latar sederhana. Kamera umumnya memerlukan izin browser dan halaman pada konteks aman seperti `localhost` atau HTTPS. Aplikasi ini dijalankan di `localhost`.

## API prediksi

Endpoint `POST /api/predict` menerima gambar sebagai multipart form-data:

- `images`: satu atau beberapa file (dipakai oleh antarmuka).
- `image`: satu file (alternatif untuk klien yang mengirim satu gambar).

Respons sukses berisi `results` dan `count`. Setiap hasil memuat nama file, label, glyph aksara, bunyi, skor keyakinan, status dikenali, alasan/pesan bila ditolak, serta kandidat `top_k`. File yang tidak valid atau gagal diproses memiliki properti `error`. Tidak adanya file, jumlah file berlebih, atau total unggahan terlalu besar menghasilkan respons error HTTP.
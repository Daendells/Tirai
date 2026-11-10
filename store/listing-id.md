# Listing Chrome Web Store dan Edge Add-ons (Bahasa Indonesia)

## Nama

Tirai: tirai privasi untuk WhatsApp Web

## Deskripsi singkat (maksimal 132 karakter)

Menyamarkan chat WhatsApp Web yang tidak Anda baca, menutupi NIK dan nomor rekening, dan menyamarkan semua saat berbagi layar.

## Deskripsi lengkap

Tirai menjaga chat WhatsApp Web Anda tetap pribadi saat orang lain bisa melihat layar Anda.

Pada mode Normal, daftar chat tertutup tirai buram, dan chat yang sedang Anda buka tetap terbaca. Sebuah lampu baca kecil mengikuti kursor. Arahkan kursor ke satu chat atau satu pesan, dan hanya bagian itu yang terbuka. Mode Penuh menyamarkan seluruh halaman. Satu pintasan (Alt+Shift+Z) berpindah di antara kedua mode.

Yang bisa Anda lakukan:
- Menyamarkan daftar chat atau seluruh halaman, lalu membaca satu baris atau satu pesan dengan lampu baca.
- Menentukan aturan untuk chat yang sedang dibuka: mengikuti mode, selalu disamarkan, atau selalu ditampilkan.
- Menutupi angka sensitif di chat yang Anda baca: NIK, nomor rekening, nomor kartu, kode OTP, dan nomor HP. Alamat e-mail bisa ikut ditutupi jika Anda mengaktifkannya. Arahkan kursor ke angka itu sebentar untuk membacanya. Saat disalin, yang tersalin tetap teks aslinya.
- Menyamarkan semuanya secara otomatis saat rapat di browser berbagi layar (Google Meet, Zoom, Teams, Discord, Slack, Whereby, Jitsi). Fitur ini opsional, dan Tirai baru meminta izinnya saat Anda mengaktifkannya.
- Menyamarkan halaman saat jendela WhatsApp tidak aktif atau saat Anda meninggalkan komputer. Keduanya opsional.
- Memasang tirai yang sama di tab lain, misalnya halaman bank, lewat "Pasang tirai di tab ini".
- Memakai popup dan pengaturan dalam Bahasa Indonesia atau Inggris.

Cara kerjanya: Tirai menaruh lapisan buram di atas halaman. Tirai tidak mengubah tampilan elemen milik WhatsApp, yang sering berganti. Jika tata letak WhatsApp berubah, Tirai menutupi lebih banyak, bukan lebih sedikit.

Privasi: Tirai tidak mengumpulkan atau mengirim data apa pun. Tirai tidak melakukan permintaan jaringan. Pengaturan Anda tetap di browser.

Batasan: Tirai hanya menyembunyikan tampilan di layar. Tirai tidak melindungi dari orang yang sedang memakai komputer Anda. Untuk itu, gunakan fitur Kunci Aplikasi bawaan WhatsApp. Tirai tidak berlaku untuk aplikasi WhatsApp Desktop. Pendeteksi angka bisa terlewat pada beberapa kasus, dan hasil pengukurannya dipublikasikan di repositori proyek.

Tirai tidak berafiliasi dengan WhatsApp atau Meta.

Kode sumber (lisensi MIT): https://github.com/Daendells/tirai

## Tujuan tunggal

Tirai punya satu tujuan: menjaga chat WhatsApp Web dan isi halaman sensitif lainnya tetap tersembunyi dari orang yang bisa melihat layar. Semua fiturnya (tirai, lampu baca, penutup angka, dan penyamaran otomatis saat berbagi layar, saat komputer tidak dipakai, atau saat Anda pergi) melayani tujuan itu.

## Alasan setiap izin

- **Akses situs https://web.whatsapp.com/***: Tirai memasang tirai dan penutup angka di WhatsApp Web. Untuk itu Tirai perlu membaca tata letak dan teks yang terlihat di halaman tersebut. Tidak ada yang dikirim ke mana pun.
- **storage**: Menyimpan pengaturan dan aturan chat pengguna di browser, serta status sementara (misalnya "komputer sedang ditinggal") selama browser terbuka.
- **idle**: Memungkinkan Tirai menyamarkan halaman saat pengguna meninggalkan komputer, jika opsi itu diaktifkan.
- **scripting**: Memasang Tirai di tab WhatsApp yang sudah terbuka saat Tirai dipasang atau diperbarui, mendaftarkan skrip deteksi berbagi layar setelah pengguna mengaktifkan opsinya, dan memasang tirai di tab lain atas permintaan pengguna.
- **activeTab**: Memungkinkan pengguna menutupi tab aktif selain WhatsApp lewat "Pasang tirai di tab ini" atau pintasan, tanpa memberi Tirai akses ke semua situs.
- **Akses opsional ke situs rapat** (meet.google.com, *.zoom.us, teams.microsoft.com, teams.live.com, discord.com, app.slack.com, *.whereby.com, meet.jit.si): Diminta hanya saat pengguna mengaktifkan "Samarkan semua saat saya berbagi layar". Tirai memakainya untuk menjalankan skrip kecil yang mengetahui kapan halaman mulai atau berhenti berbagi layar, sehingga WhatsApp bisa disamarkan selama itu. Tirai tidak membaca atau merekam rapat. Jika opsi dimatikan, izinnya dicabut.

## Pernyataan penggunaan data

Tirai tidak mengumpulkan atau mengirim data apa pun.

- Informasi pengenal pribadi: tidak dikumpulkan.
- Data kesehatan, keuangan, autentikasi, lokasi, riwayat web, aktivitas pengguna, dan isi situs: tidak dikumpulkan dan tidak dikirim. Tirai membaca teks yang terlihat di WhatsApp Web hanya di dalam browser, untuk menempatkan penutup angka. Teks itu tidak disimpan dan tidak dikirim.
- Pengaturan dan nama aturan chat disimpan lokal di browser.
- Data tidak dijual, tidak dipakai di luar tujuan tunggal Tirai, dan tidak dipakai untuk menilai kelayakan kredit atau pinjaman.

Kebijakan privasi: https://github.com/Daendells/tirai/blob/main/docs/privacy.md

## Pemberitahuan

Tirai tidak berafiliasi dengan WhatsApp atau Meta. WhatsApp adalah merek dagang pemiliknya.

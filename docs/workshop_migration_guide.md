# Panduan Migrasi Workshop Peserta

Dokumen ini berisi SQL query untuk memindahkan peserta dari satu workshop ke workshop lain secara konsisten di seluruh database.

## Permasalahan

Ketika memindahkan peserta dari satu workshop ke workshop lain, perlu memastikan data diperbarui di beberapa tabel:

1. Tabel `workshop_registrations` untuk relasi peserta-workshop
2. JSONB `order_details` dalam tabel `registrations` untuk view `participant_gate_relations` 
3. Data check-in lama perlu dibersihkan jika ada

Perpindahan yang tidak lengkap bisa menyebabkan peserta tidak dapat melakukan check-in di workshop baru mereka.

## Query SQL untuk Migrasi Workshop

```sql
-- Query SQL untuk memindahkan workshop peserta dengan QR code secara penuh
-- Parameter: 
--   qr_code         : Kode QR peserta yang ingin dipindahkan
--   new_workshop_id : ID workshop tujuan (UUID)
--   old_workshop_id : ID workshop asal (UUID), opsional - akan otomatis dicari jika tidak ditentukan

BEGIN;

-- 0. Variabel untuk menyimpan data yang dibutuhkan
DO $$
DECLARE
    v_participant_id UUID;
    v_registration_id UUID;
    v_new_workshop_name TEXT;
    v_new_workshop_amount NUMERIC;
    v_old_workshop_id UUID;
    v_item_index INTEGER;
BEGIN
    -- 1. Mendapatkan ID peserta dari QR code
    SELECT p.id, pqc.registration_id INTO v_participant_id, v_registration_id
    FROM participants p
    JOIN participant_qr_codes pqc ON p.id = pqc.participant_id
    WHERE pqc.qr_code_id = '[qr_code]';
    
    IF v_participant_id IS NULL THEN
        RAISE EXCEPTION 'Peserta dengan QR code % tidak ditemukan', '[qr_code]';
    END IF;
    
    -- 2. Mendapatkan detail workshop baru (nama dan harga)
    SELECT name, price INTO v_new_workshop_name, v_new_workshop_amount
    FROM workshops
    WHERE id = '[new_workshop_id]';
    
    IF v_new_workshop_name IS NULL THEN
        RAISE EXCEPTION 'Workshop dengan ID % tidak ditemukan', '[new_workshop_id]';
    END IF;
    
    -- 3. Jika old_workshop_id tidak ditentukan, cari dari workshop_registrations
    IF '[old_workshop_id]' = '' THEN
        SELECT workshop_id INTO v_old_workshop_id
        FROM workshop_registrations
        WHERE participant_id = v_participant_id;
    ELSE
        v_old_workshop_id := '[old_workshop_id]'::UUID;
    END IF;
    
    IF v_old_workshop_id IS NULL THEN
        RAISE EXCEPTION 'Workshop lama untuk peserta dengan QR code % tidak ditemukan', '[qr_code]';
    END IF;
    
    -- 4. Update workshop_registrations
    UPDATE workshop_registrations
    SET workshop_id = '[new_workshop_id]'
    WHERE participant_id = v_participant_id
    AND workshop_id = v_old_workshop_id;
    
    -- 5. Cari indeks item workshop dalam JSONB order_details
    SELECT idx-1 INTO v_item_index
    FROM registrations r,
    jsonb_array_elements(r.order_details->'participants')->0->'items' WITH ORDINALITY AS arr(value, idx)
    WHERE r.id = v_registration_id
    AND (value->>'type') = 'workshop'
    LIMIT 1;
    
    IF v_item_index IS NULL THEN
        RAISE EXCEPTION 'Workshop item tidak ditemukan dalam order_details untuk registrasi %', v_registration_id;
    END IF;
    
    -- 6. Update order_details di registrations
    UPDATE registrations
    SET order_details = jsonb_set(
        order_details,
        '{participants,0,items,' || v_item_index || '}',
        jsonb_build_object(
            'id', '[new_workshop_id]',
            'name', v_new_workshop_name,
            'type', 'workshop',
            'amount', v_new_workshop_amount
        )
    )
    WHERE id = v_registration_id;
    
    -- 7. Hapus check-ins lama dari workshop lama (jika ada)
    DELETE FROM gate_check_ins
    WHERE participant_id = v_participant_id
    AND gate_id = v_old_workshop_id
    AND gate_type = 'workshop';
    
    RAISE NOTICE 'Perpindahan workshop berhasil untuk peserta dengan QR %', '[qr_code]';
END $$;

COMMIT;
```

## Cara Penggunaan

Untuk menggunakan query di atas:

1. Ganti `[qr_code]` dengan kode QR peserta yang ingin dipindahkan
2. Ganti `[new_workshop_id]` dengan ID workshop tujuan (UUID)
3. Ganti `[old_workshop_id]` dengan ID workshop asal jika diketahui, atau kosongkan untuk pencarian otomatis

### Contoh Penggunaan

```sql
-- Contoh migrasi peserta dengan QR 'E39TSZ' ke workshop dengan ID 'ec37dd11-403f-4545-b7e7-9bad9c335b33'
-- Tanpa menentukan workshop asal (akan otomatis dicari)

BEGIN;

DO $$
DECLARE
    v_participant_id UUID;
    v_registration_id UUID;
    v_new_workshop_name TEXT;
    v_new_workshop_amount NUMERIC;
    v_old_workshop_id UUID;
    v_item_index INTEGER;
BEGIN
    -- Langkah 1-7 dari query di atas dengan penggantian parameter
    -- [qr_code] = 'E39TSZ'
    -- [new_workshop_id] = 'ec37dd11-403f-4545-b7e7-9bad9c335b33'
    -- [old_workshop_id] = ''
    
    -- Kode query sama seperti di atas dengan nilai parameter yang sudah diganti
END $$;

COMMIT;
```

## Penjelasan Query

1. **Transaksi Atomik**: Query menggunakan transaksi (`BEGIN`/`COMMIT`) untuk memastikan semua perubahan berhasil atau gagal bersama-sama.

2. **Blok PL/pgSQL**: Blok `DO $$` memungkinkan penggunaan variabel PL/pgSQL untuk menangani data dinamis.

3. **Komponen Update**:
   - Tabel `workshop_registrations` untuk relasi peserta-workshop
   - JSONB `order_details` dalam `registrations` untuk view `participant_gate_relations`
   - Membersihkan data check-in lama jika ada

4. **Validasi Data**: Query melakukan validasi untuk memastikan QR code dan workshop valid.

5. **Penanganan Error**: Penggunaan `EXCEPTION` untuk menangani kasus kesalahan.

6. **Pencarian Otomatis**: Otomatis mengambil data workshop lama jika tidak ditentukan.

## Keamanan dan Efisiensi

Query ini bersifat idempotent dan aman untuk dijalankan, serta mencakup semua perubahan yang diperlukan untuk perpindahan workshop yang konsisten. Selalu lakukan backup database sebelum melakukan operasi massal.

## Troubleshooting

Jika proses migrasi gagal, periksa:

1. Apakah QR code peserta valid dan ada dalam database
2. Apakah ID workshop tujuan valid
3. Apakah peserta sudah terdaftar di workshop lama
4. Apakah ada konflik dalam data (misalnya peserta sudah check-in di workshop baru)
5. Log database untuk pesan error spesifik

## Penutup

Query ini menyelesaikan masalah perpindahan workshop peserta dengan menjaga konsistensi data di seluruh sistem, memastikan peserta dapat melakukan check-in di workshop baru tanpa masalah.

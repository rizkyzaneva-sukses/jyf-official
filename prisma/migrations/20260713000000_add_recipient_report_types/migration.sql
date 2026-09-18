-- Pisahkan tujuan laporan per tipe (daily/weekly/monthly) via topic ID.
-- 1. Hapus unique constraint pada chat_id agar 1 grup bisa punya beberapa recipient (topic berbeda).
-- 2. Tambah kolom report_types (comma-separated: daily,weekly,monthly) — kosong/null = semua tipe.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'telegram_recipients'
      AND constraint_name = 'telegram_recipients_chat_id_key'
  ) THEN
    ALTER TABLE "telegram_recipients" DROP CONSTRAINT "telegram_recipients_chat_id_key";
  END IF;
END $$;

ALTER TABLE "telegram_recipients" ADD COLUMN IF NOT EXISTS "report_types" TEXT;

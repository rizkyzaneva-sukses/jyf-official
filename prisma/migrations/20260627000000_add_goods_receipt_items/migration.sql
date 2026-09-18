-- AlterTable: Make poId and poNumber nullable on goods_receipts
ALTER TABLE "goods_receipts" ALTER COLUMN "po_id" DROP NOT NULL;
ALTER TABLE "goods_receipts" ALTER COLUMN "po_number" DROP NOT NULL;

-- AddColumns: receipt_number, surat_jalan_number
ALTER TABLE "goods_receipts" ADD COLUMN "receipt_number" TEXT;
ALTER TABLE "goods_receipts" ADD COLUMN "surat_jalan_number" TEXT;

-- Backfill receipt_number for existing rows
UPDATE "goods_receipts" SET "receipt_number" = 'GR-LEGACY-' || SUBSTRING("id" FROM 1 FOR 8);

-- Set NOT NULL + UNIQUE on receipt_number
ALTER TABLE "goods_receipts" ALTER COLUMN "receipt_number" SET NOT NULL;
CREATE UNIQUE INDEX "goods_receipts_receipt_number_key" ON "goods_receipts"("receipt_number");
CREATE INDEX "goods_receipts_receiptNumber_idx" ON "goods_receipts"("receipt_number");

-- CreateTable: goods_receipt_items
CREATE TABLE "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receipt_id" TEXT NOT NULL,
    "po_id" TEXT,
    "po_item_id" TEXT,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "qty_received" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goods_receipt_items_receipt_id_idx" ON "goods_receipt_items"("receipt_id");
CREATE INDEX "goods_receipt_items_po_id_idx" ON "goods_receipt_items"("po_id");

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

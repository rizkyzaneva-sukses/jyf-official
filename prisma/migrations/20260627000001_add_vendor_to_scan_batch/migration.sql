-- AlterTable: Add vendorId and vendorName to inventory_scan_batches
ALTER TABLE "inventory_scan_batches" ADD COLUMN "vendor_id" TEXT;
ALTER TABLE "inventory_scan_batches" ADD COLUMN "vendor_name" TEXT;

-- CreateIndex
CREATE INDEX "inventory_scan_batches_vendor_id_idx" ON "inventory_scan_batches"("vendor_id");

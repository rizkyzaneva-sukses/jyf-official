-- ELYASR-OPS: Initial baseline migration
-- This migration represents the full schema state.
-- For EXISTING databases, mark as applied: prisma migrate resolve --applied 20260616000000_init

CREATE TYPE "UserRole" AS ENUM ('OWNER', 'FINANCE', 'STAFF', 'EXTERNAL');
CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "LedgerReason" AS ENUM ('SALES', 'RETURN_PURCHASE', 'PRIVE', 'MARKETING', 'PURCHASE', 'RETURN_SALES', 'ADJUSTMENT');
CREATE TYPE "ScanBatchStatus" AS ENUM ('DRAFT', 'COMMITTED', 'CANCELED');
CREATE TYPE "ScanBatchReason" AS ENUM ('SALES', 'RETURN_PURCHASE', 'PRIVE', 'MARKETING', 'PURCHASE', 'RETURN_SALES');
CREATE TYPE "OpnameBatchStatus" AS ENUM ('DRAFT', 'COMMITTED', 'CANCELED');
CREATE TYPE "POStatus" AS ENUM ('OPEN', 'PARTIAL', 'COMPLETED', 'CANCELLED');
CREATE TYPE "POPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL_PAID', 'PAID');
CREATE TYPE "POItemStatus" AS ENUM ('OPEN', 'PARTIAL', 'COMPLETED');
CREATE TYPE "WalletTrxType" AS ENUM ('PAYOUT', 'OTHER_INCOME', 'EXPENSE', 'TRANSFER', 'MODAL_MASUK', 'PRIVE', 'INVESTASI', 'VENDOR_PAYMENT', 'PENGEMBALIAN_MODAL', 'BAYAR_UTANG', 'TERIMA_PIUTANG_ND');
CREATE TYPE "MasterCategoryType" AS ENUM ('OTHER_INCOME', 'EXPENSE_BEBAN', 'EXPENSE_NON_BEBAN');
CREATE TYPE "VendorPaymentType" AS ENUM ('DP', 'PELUNASAN', 'PARTIAL');
CREATE TYPE "VendorPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "UtangType" AS ENUM ('SUNTIKAN_MODAL', 'PINJAMAN_BANK', 'PINJAMAN_PRIBADI', 'LAINNYA');
CREATE TYPE "UtangStatus" AS ENUM ('OUTSTANDING', 'PARTIAL', 'PAID');
CREATE TYPE "PiutangType" AS ENUM ('PINJAMAN_KARYAWAN', 'PO_VENDOR_BELUM_DIKIRIM', 'LAINNYA');
CREATE TYPE "PiutangStatus" AS ENUM ('OUTSTANDING', 'PARTIAL', 'COLLECTED');
CREATE TYPE "RelatedEntityType" AS ENUM ('PurchaseOrder', 'VendorPayment', 'Other');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SCAN', 'COMMIT', 'CANCEL');

CREATE TABLE "app_users" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"username" TEXT NOT NULL,
"password_hash" TEXT NOT NULL,
"user_role" "UserRole" NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
"full_name" TEXT,
  CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "product_categories" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"category_name" TEXT NOT NULL,
"description" TEXT,
"is_active" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "master_products" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"sku" TEXT NOT NULL,
"product_name" TEXT NOT NULL,
"category_id" TEXT,
"category_name" TEXT,
"unit" TEXT NOT NULL,
"hpp" INTEGER DEFAULT 0 NOT NULL,
"rop" INTEGER DEFAULT 0 NOT NULL,
"lead_time_days" INTEGER DEFAULT 0 NOT NULL,
"stok_awal" INTEGER DEFAULT 0 NOT NULL,
"last_opname_date" TIMESTAMP(3),
"variant_info" JSONB,
"is_active" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "master_products_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "inventory_ledger" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"sku" TEXT NOT NULL,
"trx_date" TIMESTAMP(3) NOT NULL,
"direction" "LedgerDirection" NOT NULL,
"reason" "LedgerReason" NOT NULL,
"qty" INTEGER NOT NULL,
"batch_id" TEXT,
"ref_opname_id" TEXT,
"note" TEXT,
  CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_ledger_sku_idx" ON "inventory_ledger" (sku);
CREATE INDEX "inventory_ledger_trxDate_idx" ON "inventory_ledger" (trxDate);
CREATE INDEX "inventory_ledger_batchId_idx" ON "inventory_ledger" (batchId);

CREATE TABLE "inventory_scan_batches" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"batch_date" TIMESTAMP(3) NOT NULL,
"direction" "LedgerDirection" NOT NULL,
"reason" "ScanBatchReason",
"status" "ScanBatchStatus" NOT NULL,
"items_json" JSONB,
"scanned_by" TEXT,
  CONSTRAINT "inventory_scan_batches_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "stock_opname_batches" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"opname_date" TIMESTAMP(3) NOT NULL,
"warehouse_name" TEXT,
"status" "OpnameBatchStatus" NOT NULL,
"note" TEXT,
"total_sku" INTEGER DEFAULT 0 NOT NULL,
"total_adjustment_qty" INTEGER DEFAULT 0 NOT NULL,
"committed_at" TIMESTAMP(3),
"committed_by" TEXT,
  CONSTRAINT "stock_opname_batches_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "stock_opname_items" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"opname_id" TEXT NOT NULL,
"sku" TEXT NOT NULL,
"system_qty" INTEGER NOT NULL,
"actual_qty" INTEGER NOT NULL,
"diff_qty" INTEGER NOT NULL,
"note" TEXT,
  CONSTRAINT "stock_opname_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_opname_items_opnameId_idx" ON "stock_opname_items" (opnameId);

CREATE TABLE "orders" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"order_no" TEXT NOT NULL,
"status" TEXT NOT NULL,
"platform" TEXT,
"airwaybill" TEXT,
"order_created_at" TEXT,
"trx_date" TIMESTAMP(3),
"sku" TEXT,
"product_name" TEXT,
"qty" INTEGER NOT NULL,
"total_product_price" INTEGER DEFAULT 0 NOT NULL,
"real_omzet" INTEGER DEFAULT 0 NOT NULL,
"city" TEXT,
"province" TEXT,
"buyer_username" TEXT,
"receiver_name" TEXT,
"phone" TEXT,
"hpp" INTEGER DEFAULT 0 NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orders_orderNo_idx" ON "orders" (orderNo);
CREATE INDEX "orders_airwaybill_idx" ON "orders" (airwaybill);
CREATE INDEX "orders_status_idx" ON "orders" (status);
CREATE INDEX "orders_platform_idx" ON "orders" (platform);
CREATE INDEX "orders_orderCreatedAt_idx" ON "orders" (orderCreatedAt);
CREATE INDEX "orders_trxDate_idx" ON "orders" (trxDate);
CREATE INDEX "orders_platform_status_idx" ON "orders" (platform, status);
CREATE INDEX "orders_status_orderCreatedAt_idx" ON "orders" (status, orderCreatedAt);
CREATE INDEX "orders_platform_orderCreatedAt_idx" ON "orders" (platform, orderCreatedAt);
CREATE INDEX "orders_trxDate_platform_idx" ON "orders" (trxDate, platform);

CREATE TABLE "order_scan_logs" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"order_id" TEXT NOT NULL,
"order_no" TEXT NOT NULL,
"scanned_at" TIMESTAMP(3) NOT NULL,
"scanned_by" TEXT,
"note" TEXT,
  CONSTRAINT "order_scan_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_scan_logs_orderNo_idx" ON "order_scan_logs" (orderNo);

CREATE TABLE "wallets" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"name" TEXT NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
"is_ads_budget" BOOLEAN DEFAULT false NOT NULL,
"linked_platform" TEXT,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "payouts" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"order_no" TEXT NOT NULL,
"released_date" TIMESTAMP(3) NOT NULL,
"platform" TEXT,
"omzet" INTEGER NOT NULL,
"platform_fee" INTEGER NOT NULL,
"ams_fee" INTEGER NOT NULL,
"platform_fee_other" INTEGER DEFAULT 0 NOT NULL,
"beban_ongkir" INTEGER DEFAULT 0 NOT NULL,
"total_income" INTEGER NOT NULL,
"wallet_id" TEXT NOT NULL,
"source" TEXT,
"order_id" TEXT,
  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payouts_orderNo_idx" ON "payouts" (orderNo);
CREATE INDEX "payouts_walletId_idx" ON "payouts" (walletId);
CREATE INDEX "payouts_platform_idx" ON "payouts" (platform);
CREATE INDEX "payouts_releasedDate_idx" ON "payouts" (releasedDate);

CREATE TABLE "wallet_ledger" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"wallet_id" TEXT NOT NULL,
"trx_date" TIMESTAMP(3) NOT NULL,
"trx_type" "WalletTrxType" NOT NULL,
"category" TEXT,
"amount" INTEGER NOT NULL,
"note" TEXT,
"ref_order_no" TEXT,
  CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_ledger_walletId_idx" ON "wallet_ledger" (walletId);
CREATE INDEX "wallet_ledger_trxDate_idx" ON "wallet_ledger" (trxDate);
CREATE INDEX "wallet_ledger_trxType_idx" ON "wallet_ledger" (trxType);

CREATE TABLE "master_categories" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"category_type" "MasterCategoryType" NOT NULL,
"name" TEXT NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "master_categories_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "master_reasons" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"reason_code" TEXT NOT NULL,
"name" TEXT NOT NULL,
"direction" "LedgerDirection" NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "master_reasons_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "vendors" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"vendor_code" TEXT NOT NULL,
"nama_vendor" TEXT NOT NULL,
"kontak" TEXT,
"email" TEXT,
"alamat" TEXT,
"rekening" TEXT,
"bank" TEXT,
"term_payment" INTEGER DEFAULT 0 NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "purchase_orders" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"po_number" TEXT NOT NULL,
"vendor_id" TEXT NOT NULL,
"vendor_name" TEXT NOT NULL,
"po_date" TIMESTAMP(3) NOT NULL,
"expected_date" TIMESTAMP(3),
"status" "POStatus" NOT NULL,
"payment_status" "POPaymentStatus" NOT NULL,
"total_items" INTEGER DEFAULT 0 NOT NULL,
"total_qty_order" INTEGER DEFAULT 0 NOT NULL,
"total_qty_received" INTEGER DEFAULT 0 NOT NULL,
"total_amount" INTEGER DEFAULT 0 NOT NULL,
"total_paid" INTEGER DEFAULT 0 NOT NULL,
"note" TEXT,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_orders_vendorId_idx" ON "purchase_orders" (vendorId);
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" (status);

CREATE TABLE "purchase_order_items" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"po_id" TEXT NOT NULL,
"po_number" TEXT NOT NULL,
"vendor_id" TEXT NOT NULL,
"vendor_name" TEXT NOT NULL,
"sku" TEXT NOT NULL,
"product_name" TEXT NOT NULL,
"qty_order" INTEGER NOT NULL,
"qty_received" INTEGER DEFAULT 0 NOT NULL,
"unit_price" INTEGER DEFAULT 0 NOT NULL,
"status" "POItemStatus" NOT NULL,
  CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_items_poId_idx" ON "purchase_order_items" (poId);
CREATE INDEX "purchase_order_items_sku_idx" ON "purchase_order_items" (sku);

CREATE TABLE "goods_receipts" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"po_id" TEXT NOT NULL,
"po_number" TEXT NOT NULL,
"vendor_id" TEXT NOT NULL,
"vendor_name" TEXT NOT NULL,
"receipt_date" TIMESTAMP(3) NOT NULL,
"items_json" JSONB,
"note" TEXT,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "goods_receipts_poId_idx" ON "goods_receipts" (poId);

CREATE TABLE "vendor_payments" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"payment_number" TEXT,
"payment_date" TIMESTAMP(3) NOT NULL,
"vendor_id" TEXT NOT NULL,
"vendor_name" TEXT NOT NULL,
"po_id" TEXT,
"po_number" TEXT,
"wallet_id" TEXT NOT NULL,
"wallet_name" TEXT NOT NULL,
"amount" INTEGER NOT NULL,
"payment_type" "VendorPaymentType" NOT NULL,
"status" "VendorPaymentStatus" NOT NULL,
"note" TEXT,
  CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_payments_vendorId_idx" ON "vendor_payments" (vendorId);
CREATE INDEX "vendor_payments_poId_idx" ON "vendor_payments" (poId);

CREATE TABLE "utangs" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"type" "UtangType" NOT NULL,
"creditor_name" TEXT NOT NULL,
"source_wallet_id" TEXT NOT NULL,
"source_wallet_name" TEXT NOT NULL,
"amount" INTEGER NOT NULL,
"amount_paid" INTEGER DEFAULT 0 NOT NULL,
"trx_date" TIMESTAMP(3) NOT NULL,
"due_date" TIMESTAMP(3),
"status" "UtangStatus" NOT NULL,
"proof_image_url" TEXT,
"note" TEXT,
  CONSTRAINT "utangs_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "utang_payments" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"utang_id" TEXT NOT NULL,
"payment_date" TIMESTAMP(3) NOT NULL,
"amount" INTEGER NOT NULL,
"wallet_id" TEXT NOT NULL,
"wallet_name" TEXT NOT NULL,
"proof_image_url" TEXT,
"note" TEXT,
  CONSTRAINT "utang_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "utang_payments_utangId_idx" ON "utang_payments" (utangId);

CREATE TABLE "piutangs" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"type" "PiutangType" NOT NULL,
"debtor_name" TEXT NOT NULL,
"source_wallet_id" TEXT NOT NULL,
"source_wallet_name" TEXT NOT NULL,
"amount" INTEGER NOT NULL,
"amount_collected" INTEGER DEFAULT 0 NOT NULL,
"trx_date" TIMESTAMP(3) NOT NULL,
"due_date" TIMESTAMP(3),
"status" "PiutangStatus" NOT NULL,
"related_entity_id" TEXT,
"related_entity_type" "RelatedEntityType",
"proof_image_url" TEXT,
"note" TEXT,
  CONSTRAINT "piutangs_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "piutang_collections" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"piutang_id" TEXT NOT NULL,
"collection_date" TIMESTAMP(3) NOT NULL,
"amount" INTEGER NOT NULL,
"wallet_id" TEXT NOT NULL,
"wallet_name" TEXT NOT NULL,
"proof_image_url" TEXT,
"note" TEXT,
  CONSTRAINT "piutang_collections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "piutang_collections_piutangId_idx" ON "piutang_collections" (piutangId);

CREATE TABLE "audit_logs" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"entity_type" TEXT NOT NULL,
"action" "AuditAction" NOT NULL,
"entity_id" TEXT,
"ref_order_no" TEXT,
"before_json" JSONB,
"after_json" JSONB,
"note" TEXT,
"performed_by" TEXT NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs" (entityType);
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs" (entityId);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs" (createdAt);

CREATE TABLE "master_expense_categories" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"name" TEXT NOT NULL,
"group" TEXT NOT NULL,
"is_beban" BOOLEAN DEFAULT true NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
"is_system" BOOLEAN DEFAULT false NOT NULL,
  CONSTRAINT "master_expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "master_expense_categories_group_idx" ON "master_expense_categories" (group);

CREATE TABLE "aset_tetap" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"nama_aset" TEXT NOT NULL,
"nilai_perolehan" INTEGER NOT NULL,
"tanggal_beli" TIMESTAMP(3) NOT NULL,
"umur_ekonomis_thn" INTEGER NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
"wallet_id" TEXT,
"note" TEXT,
  CONSTRAINT "aset_tetap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aset_tetap_isActive_idx" ON "aset_tetap" (isActive);

CREATE TABLE "modal_awal" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"wallet_id" TEXT NOT NULL,
"jumlah" INTEGER NOT NULL,
"tanggal_setup" TIMESTAMP(3) NOT NULL,
"note" TEXT,
  CONSTRAINT "modal_awal_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "suggest_revisions" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"title" TEXT NOT NULL,
"description" TEXT,
"images_base64" TEXT[] DEFAULT '{}' NOT NULL,
"status" TEXT NOT NULL,
"created_by" TEXT,
  CONSTRAINT "suggest_revisions_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "sku_mappings" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"created_by" TEXT,
"from_sku" TEXT NOT NULL,
"to_sku" TEXT NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT "sku_mappings_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "app_settings" (
"key" TEXT NOT NULL,
"value" TEXT NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
"updated_by" TEXT,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);


CREATE TABLE "telegram_recipients" (
"id" TEXT DEFAULT gen_random_uuid(),
"name" TEXT NOT NULL,
"chat_id" TEXT NOT NULL,
"thread_id" TEXT,
"is_active" BOOLEAN DEFAULT true NOT NULL,
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_recipients_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "report_schedules" (
"id" TEXT DEFAULT gen_random_uuid(),
"cron_schedule" TEXT NOT NULL,
"is_active" BOOLEAN DEFAULT true NOT NULL,
"updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "ai_insights" (
"id" TEXT DEFAULT gen_random_uuid(),
"created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
"generated_by" TEXT,
"period" TEXT NOT NULL,
"period_type" TEXT NOT NULL,
"content" TEXT NOT NULL,
"model_used" TEXT NOT NULL,
"data_snapshot" JSONB,
  CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_insights_periodType_createdAt_idx" ON "ai_insights" (periodType, createdAt);

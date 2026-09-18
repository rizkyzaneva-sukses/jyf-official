-- CreateTable
CREATE TABLE "ledger_edit_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ledger_id" TEXT NOT NULL,
    "wallet_name" TEXT,
    "requested_by" TEXT NOT NULL,
    "current_snapshot" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_note" TEXT,

    CONSTRAINT "ledger_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_edit_requests_status_idx" ON "ledger_edit_requests"("status");

-- CreateIndex
CREATE INDEX "ledger_edit_requests_requested_by_idx" ON "ledger_edit_requests"("requested_by");

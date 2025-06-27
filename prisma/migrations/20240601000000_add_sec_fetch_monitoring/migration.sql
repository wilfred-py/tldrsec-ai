-- CreateTable
CREATE TABLE "SecFetchAttempt" (
  "id" TEXT NOT NULL,
  "filingId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "formType" TEXT NOT NULL,
  "urlAttempts" TEXT NOT NULL,
  "successful" BOOLEAN NOT NULL,
  "attemptCount" INTEGER NOT NULL,
  "successCount" INTEGER NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SecFetchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecFetchAttempt_filingId_idx" ON "SecFetchAttempt"("filingId");

-- CreateIndex
CREATE INDEX "SecFetchAttempt_ticker_idx" ON "SecFetchAttempt"("ticker");

-- CreateIndex
CREATE INDEX "SecFetchAttempt_formType_idx" ON "SecFetchAttempt"("formType");

-- CreateIndex
CREATE INDEX "SecFetchAttempt_timestamp_idx" ON "SecFetchAttempt"("timestamp");

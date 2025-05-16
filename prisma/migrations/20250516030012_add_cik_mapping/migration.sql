-- CreateTable
CREATE TABLE "CikMapping" (
    "id" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "aliases" TEXT[],
    "exchangeCodes" TEXT[],
    "sic" TEXT,
    "ein" TEXT,
    "entityType" TEXT,
    "formerNames" JSONB,
    "formerTickers" JSONB,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFetchStatus" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CikMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TickerChange" (
    "id" TEXT NOT NULL,
    "oldTicker" TEXT NOT NULL,
    "newTicker" TEXT NOT NULL,
    "oldCik" TEXT,
    "newCik" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "changeType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TickerChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CikMapping_cik_key" ON "CikMapping"("cik");

-- CreateIndex
CREATE INDEX "CikMapping_ticker_idx" ON "CikMapping"("ticker");

-- CreateIndex
CREATE INDEX "CikMapping_companyName_idx" ON "CikMapping"("companyName");

-- CreateIndex
CREATE INDEX "TickerChange_oldTicker_idx" ON "TickerChange"("oldTicker");

-- CreateIndex
CREATE INDEX "TickerChange_newTicker_idx" ON "TickerChange"("newTicker");

-- CreateIndex
CREATE INDEX "TickerChange_effectiveDate_idx" ON "TickerChange"("effectiveDate");

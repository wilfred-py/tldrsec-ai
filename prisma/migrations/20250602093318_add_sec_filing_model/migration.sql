-- AlterTable
ALTER TABLE "Summary" ADD COLUMN     "attempts" INTEGER DEFAULT 0,
ADD COLUMN     "cost" DOUBLE PRECISION,
ADD COLUMN     "isPartialResult" BOOLEAN DEFAULT false,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "processingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "processingErrorCode" TEXT,
ADD COLUMN     "processingStatus" TEXT,
ADD COLUMN     "processingTimeMs" INTEGER,
ADD COLUMN     "secFilingId" TEXT,
ADD COLUMN     "tokensUsed" INTEGER;

-- CreateTable
CREATE TABLE "SecFiling" (
    "id" TEXT NOT NULL,
    "tickerId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "filingDate" TIMESTAMP(3) NOT NULL,
    "secUrl" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecFiling_tickerId_formType_idx" ON "SecFiling"("tickerId", "formType");

-- CreateIndex
CREATE INDEX "SecFiling_accessionNumber_idx" ON "SecFiling"("accessionNumber");

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_secFilingId_fkey" FOREIGN KEY ("secFilingId") REFERENCES "SecFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecFiling" ADD CONSTRAINT "SecFiling_tickerId_fkey" FOREIGN KEY ("tickerId") REFERENCES "Ticker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

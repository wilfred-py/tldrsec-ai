/*
  Warnings:

  - You are about to drop the column `attemptCount` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `contextRefCount` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `formType` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `hasEmbeddedHtml` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `hasXmlContent` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `namespaceCount` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `successCount` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `successful` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `ticker` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `urlAttempts` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `xmlSize` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - Added the required column `attemptedAt` to the `SecFetchAttempt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `SecFetchAttempt` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "SecFetchAttempt_formType_idx";

-- DropIndex
DROP INDEX "SecFetchAttempt_hasXmlContent_idx";

-- DropIndex
DROP INDEX "SecFetchAttempt_ticker_idx";

-- DropIndex
DROP INDEX "SecFetchAttempt_timestamp_idx";

-- AlterTable
ALTER TABLE "SecFetchAttempt" DROP COLUMN "attemptCount",
DROP COLUMN "contextRefCount",
DROP COLUMN "formType",
DROP COLUMN "hasEmbeddedHtml",
DROP COLUMN "hasXmlContent",
DROP COLUMN "namespaceCount",
DROP COLUMN "successCount",
DROP COLUMN "successful",
DROP COLUMN "ticker",
DROP COLUMN "timestamp",
DROP COLUMN "urlAttempts",
DROP COLUMN "xmlSize",
ADD COLUMN     "attemptedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SecFiling" ALTER COLUMN "companyName" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SecFetchAttempt" ADD CONSTRAINT "SecFetchAttempt_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "SecFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

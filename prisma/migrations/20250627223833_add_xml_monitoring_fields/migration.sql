/*
  Warnings:

  - You are about to drop the column `createdAt` on the `SecFetchAttempt` table. All the data in the column will be lost.
  - Changed the type of `urlAttempts` on the `SecFetchAttempt` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "SecFetchAttempt" DROP COLUMN "createdAt",
DROP COLUMN "urlAttempts",
ADD COLUMN     "urlAttempts" JSONB NOT NULL;

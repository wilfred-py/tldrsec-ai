-- Modify SecFiling to make companyName nullable
ALTER TABLE "SecFiling" ALTER COLUMN "companyName" DROP NOT NULL;

-- Drop existing SecFetchAttempt table if it exists
DROP TABLE IF EXISTS "SecFetchAttempt";

-- Create new SecFetchAttempt table with required schema
CREATE TABLE "SecFetchAttempt" (
  "id" TEXT NOT NULL,
  "filingId" TEXT NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  
  CONSTRAINT "SecFetchAttempt_pkey" PRIMARY KEY ("id")
);

-- Add index on filingId for better performance
CREATE INDEX "SecFetchAttempt_filingId_idx" ON "SecFetchAttempt"("filingId");

-- Add foreign key constraint
ALTER TABLE "SecFetchAttempt" ADD CONSTRAINT "SecFetchAttempt_filingId_fkey" 
  FOREIGN KEY ("filingId") REFERENCES "SecFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

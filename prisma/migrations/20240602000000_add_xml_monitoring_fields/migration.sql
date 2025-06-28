-- AlterTable: Add XML monitoring fields to the SecFetchAttempt table
ALTER TABLE "SecFetchAttempt" 
ADD COLUMN "hasXmlContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "xmlSize" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hasEmbeddedHtml" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "namespaceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contextRefCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Add index for XML content filtering
CREATE INDEX "SecFetchAttempt_hasXmlContent_idx" ON "SecFetchAttempt"("hasXmlContent");

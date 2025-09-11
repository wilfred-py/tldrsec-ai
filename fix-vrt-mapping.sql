-- Fix VRT CIK mapping issue
-- Current issue: VRT is mapped to CIK 0001704715 (which belongs to Alpha Metallurgical Resources)
-- Correct mapping: VRT should be mapped to CIK 0001674101

-- First, update the incorrect VRT mapping
UPDATE "CikMapping" 
SET 
  "cik" = '0001674101',
  "companyName" = 'Vertiv Holdings Co',
  "aliases" = ARRAY['VERTIV HOLDINGS CO', 'VERTIV HOLDINGS'],
  "lastUpdated" = NOW(),
  "source" = 'MANUAL_FIX_VRT_ISSUE'
WHERE 
  "ticker" = 'VRT' 
  AND "cik" = '0001704715';

-- Add the correct mapping for Alpha Metallurgical Resources with CIK 0001704715
INSERT INTO "CikMapping" (
  "cik", 
  "ticker", 
  "companyName", 
  "aliases", 
  "exchangeCodes", 
  "sic", 
  "entityType", 
  "lastUpdated", 
  "isActive", 
  "fetchAttempts", 
  "lastFetchStatus",
  "source"
) VALUES (
  '0001704715',
  'AMR',
  'Alpha Metallurgical Resources, Inc.',
  ARRAY['ALPHA METALLURGICAL RESOURCES INC', 'ALPHA METALLURGICAL RESOURCES'],
  ARRAY['NYSE'],
  '1221',
  'operating',
  NOW(),
  true,
  0,
  'manual_fix',
  'MANUAL_FIX_VRT_ISSUE'
) ON CONFLICT ("cik") DO UPDATE SET
  "ticker" = EXCLUDED."ticker",
  "companyName" = EXCLUDED."companyName",
  "aliases" = EXCLUDED."aliases",
  "lastUpdated" = NOW(),
  "source" = 'MANUAL_FIX_VRT_ISSUE';

-- Verify the changes
SELECT "ticker", "cik", "companyName" FROM "CikMapping" WHERE "ticker" IN ('VRT', 'AMR') ORDER BY "ticker";
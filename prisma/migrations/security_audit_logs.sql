-- Security Enhancement: Audit Log Protection Schema
-- Adds integrity protection and tamper-proof audit logging

-- Add new columns to existing AuditLog table for integrity protection
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "integrityHash" VARCHAR(64);
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "previousHash" VARCHAR(64);

-- Add index for performance on sequence-based queries
CREATE INDEX IF NOT EXISTS "AuditLog_sequenceNumber_idx" ON "AuditLog"("sequenceNumber");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");

-- Add unique constraint on sequence number to prevent duplicates
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sequenceNumber_unique" UNIQUE ("sequenceNumber");

-- Create function to validate audit log integrity
CREATE OR REPLACE FUNCTION validate_audit_chain()
RETURNS BOOLEAN AS $$
DECLARE
    rec RECORD;
    prev_hash VARCHAR(64) := '';
    is_valid BOOLEAN := TRUE;
BEGIN
    -- Iterate through audit logs in sequence order
    FOR rec IN 
        SELECT "sequenceNumber", "integrityHash", "previousHash"
        FROM "AuditLog" 
        WHERE "sequenceNumber" >= 0 
        ORDER BY "sequenceNumber" ASC
    LOOP
        -- Check if previous hash matches expected
        IF rec."previousHash" != prev_hash THEN
            is_valid := FALSE;
            EXIT;
        END IF;
        
        prev_hash := rec."integrityHash";
    END LOOP;
    
    RETURN is_valid;
END;
$$ LANGUAGE plpgsql;
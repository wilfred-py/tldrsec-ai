-- Add security and analytics columns to newsletter_subscribers table
-- This migration fixes the newsletter subscription failure by adding missing columns
-- that the API code expects when inserting subscriber data

-- Add the missing columns to newsletter_subscribers table
ALTER TABLE newsletter_subscribers 
ADD COLUMN IF NOT EXISTS subscriber_ip TEXT,
ADD COLUMN IF NOT EXISTS email_domain TEXT,  
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2), -- 0.00 to 1.00 confidence score
ADD COLUMN IF NOT EXISTS is_trusted_domain BOOLEAN DEFAULT false;

-- Add performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_domain 
ON newsletter_subscribers(email_domain);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_confidence_score 
ON newsletter_subscribers(confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_is_trusted_domain 
ON newsletter_subscribers(is_trusted_domain);

-- Add composite index for security analysis queries
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_security_analysis 
ON newsletter_subscribers(is_trusted_domain, confidence_score DESC, email_domain);

-- Add comment to document the purpose of new columns
COMMENT ON COLUMN newsletter_subscribers.subscriber_ip IS 'Client IP address for security tracking and abuse prevention';
COMMENT ON COLUMN newsletter_subscribers.email_domain IS 'Email domain for analytics and domain-based analysis';
COMMENT ON COLUMN newsletter_subscribers.confidence_score IS 'Email validation confidence score (0.00 to 1.00)';
COMMENT ON COLUMN newsletter_subscribers.is_trusted_domain IS 'Whether the email domain is considered trusted';
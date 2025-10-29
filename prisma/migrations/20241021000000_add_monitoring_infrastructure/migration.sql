-- Migration for enhanced monitoring infrastructure
-- Adds pipeline health history and error alerts tables

-- Create PipelineHealthHistory table
CREATE TABLE "PipelineHealthHistory" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pipelineStatus" TEXT NOT NULL,
    "processingLatency" INTEGER NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "activeJobs" INTEGER NOT NULL,
    "queueDepth" INTEGER NOT NULL,
    "memoryUsage" DOUBLE PRECISION NOT NULL,
    "cpuUsage" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineHealthHistory_pkey" PRIMARY KEY ("id")
);

-- Create ErrorAlert table  
CREATE TABLE "ErrorAlert" (
    "id" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "errorCode" TEXT,
    "stackTrace" TEXT,
    "context" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorAlert_pkey" PRIMARY KEY ("id")
);

-- Create indexes for PipelineHealthHistory
CREATE INDEX "PipelineHealthHistory_timestamp_idx" ON "PipelineHealthHistory"("timestamp");
CREATE INDEX "PipelineHealthHistory_pipelineStatus_idx" ON "PipelineHealthHistory"("pipelineStatus");

-- Create indexes for ErrorAlert
CREATE INDEX "ErrorAlert_alertType_idx" ON "ErrorAlert"("alertType");
CREATE INDEX "ErrorAlert_source_idx" ON "ErrorAlert"("source");
CREATE INDEX "ErrorAlert_resolved_idx" ON "ErrorAlert"("resolved");
CREATE INDEX "ErrorAlert_createdAt_idx" ON "ErrorAlert"("createdAt");

-- Add monitoring thresholds configuration table
CREATE TABLE "MonitoringThreshold" (
    "id" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "thresholdType" TEXT NOT NULL, -- "warning", "critical"
    "operator" TEXT NOT NULL, -- "gt", "lt", "eq", "gte", "lte"
    "value" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "alertFrequencyMins" INTEGER NOT NULL DEFAULT 15,
    "escalationDelayMins" INTEGER NOT NULL DEFAULT 60,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringThreshold_pkey" PRIMARY KEY ("id")
);

-- Create index for monitoring thresholds
CREATE INDEX "MonitoringThreshold_metricName_enabled_idx" ON "MonitoringThreshold"("metricName", "enabled");
CREATE UNIQUE INDEX "MonitoringThreshold_metricName_thresholdType_key" ON "MonitoringThreshold"("metricName", "thresholdType");

-- Insert default monitoring thresholds
INSERT INTO "MonitoringThreshold" ("id", "metricName", "thresholdType", "operator", "value", "alertFrequencyMins", "escalationDelayMins", "description", "createdAt", "updatedAt") VALUES
('cluid_error_rate_warning', 'error_rate_percent', 'warning', 'gt', 5.0, 15, 60, 'Error rate exceeds 5%', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_error_rate_critical', 'error_rate_percent', 'critical', 'gt', 15.0, 5, 30, 'Error rate exceeds 15%', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_latency_warning', 'avg_processing_latency_ms', 'warning', 'gt', 30000, 15, 60, 'Average processing latency exceeds 30 seconds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_latency_critical', 'avg_processing_latency_ms', 'critical', 'gt', 60000, 5, 30, 'Average processing latency exceeds 60 seconds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_queue_depth_warning', 'queue_depth', 'warning', 'gt', 100, 15, 60, 'Queue depth exceeds 100 jobs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_queue_depth_critical', 'queue_depth', 'critical', 'gt', 500, 5, 30, 'Queue depth exceeds 500 jobs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_memory_warning', 'memory_usage_mb', 'warning', 'gt', 1024, 15, 60, 'Memory usage exceeds 1GB', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_memory_critical', 'memory_usage_mb', 'critical', 'gt', 2048, 5, 30, 'Memory usage exceeds 2GB', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_success_rate_warning', 'success_rate_percent', 'warning', 'lt', 95.0, 15, 60, 'Success rate below 95%', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cluid_success_rate_critical', 'success_rate_percent', 'critical', 'lt', 85.0, 5, 30, 'Success rate below 85%', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
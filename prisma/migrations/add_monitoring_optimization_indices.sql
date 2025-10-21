-- Add composite indices for monitoring table time-based queries
-- These indices optimize common monitoring queries for performance dashboards

-- CronJobExecution time-based queries with status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cron_execution_time_status_perf" 
ON "CronJobExecution" ("startedAt" DESC, "status", "durationMs", "memoryUsageMb") 
WHERE "completedAt" IS NOT NULL;

-- CronJobMetrics time-based aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cron_metrics_time_cost_perf" 
ON "CronJobMetrics" ("createdAt" DESC, "aiCostTotal", "operationalCostTotal", "usersAffected");

-- PipelineHealthHistory time-series queries with status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pipeline_health_time_status" 
ON "PipelineHealthHistory" ("timestamp" DESC, "pipelineStatus", "processingLatency", "successRate");

-- ErrorAlert escalation and notification queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_error_alert_escalation" 
ON "ErrorAlert" ("createdAt" DESC, "alertType", "resolved", "escalatedAt") 
WHERE "resolved" = false;

-- CronJobPerformance time-series monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cron_performance_timeseries" 
ON "CronJobPerformance" ("timestamp" DESC, "phase", "memoryUsageMb", "cpuUsagePercent", "activeConnections");

-- TierProcessingMetrics for daily/weekly reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tier_metrics_reporting" 
ON "TierProcessingMetrics" ("date" DESC, "tier", "usersProcessed", "budgetUsed");

-- JobQueue monitoring and performance queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_job_queue_monitoring" 
ON "JobQueue" ("createdAt" DESC, "status", "executionTime", "costUSD") 
WHERE "status" IN ('completed', 'failed');

-- MonitoringThreshold active threshold queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_monitoring_threshold_active" 
ON "MonitoringThreshold" ("enabled", "metricName", "thresholdType", "value") 
WHERE "enabled" = true;

-- Summary processing performance metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_summary_performance_monitoring" 
ON "Summary" ("createdAt" DESC, "processingTimeMs", "cost", "processingStatus", "tokensUsed") 
WHERE "processingCompletedAt" IS NOT NULL;

-- AuditLog security and access pattern monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_security_monitoring" 
ON "AuditLog" ("createdAt" DESC, "action", "success", "ipAddress") 
WHERE "success" = false OR "action" IN ('login', 'admin_access', 'data_export');
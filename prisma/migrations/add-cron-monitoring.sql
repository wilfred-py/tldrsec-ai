-- Cron Job Execution Monitoring
CREATE TABLE "CronJobExecution" (
  "id" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "status" TEXT NOT NULL, -- 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT'
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3),
  "durationMs" INTEGER,
  "triggerSource" TEXT NOT NULL, -- 'VERCEL_CRON', 'MANUAL', 'EXTERNAL'
  "environment" TEXT NOT NULL, -- 'PRODUCTION', 'STAGING', 'DEVELOPMENT'
  
  -- Execution Metrics
  "memoryUsageMB" DOUBLE PRECISION,
  "cpuUsagePercent" DOUBLE PRECISION,
  "errorCount" INTEGER DEFAULT 0,
  "warningCount" INTEGER DEFAULT 0,
  
  -- Cost Tracking
  "totalCostUSD" DOUBLE PRECISION DEFAULT 0,
  "aiCostUSD" DOUBLE PRECISION DEFAULT 0,
  "emailCostUSD" DOUBLE PRECISION DEFAULT 0,
  "tokensUsed" INTEGER DEFAULT 0,
  
  -- Processing Stats
  "tickersChecked" INTEGER DEFAULT 0,
  "newFilingsFound" INTEGER DEFAULT 0,
  "filingsProcessed" INTEGER DEFAULT 0,
  "emailsSent" INTEGER DEFAULT 0,
  "usersNotified" INTEGER DEFAULT 0,
  
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CronJobExecution_pkey" PRIMARY KEY ("id")
);

-- Filing Processing Details
CREATE TABLE "FilingProcessingLog" (
  "id" TEXT NOT NULL,
  "cronJobExecutionId" TEXT NOT NULL,
  "accessionNumber" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "filingType" TEXT NOT NULL,
  "filingDate" TIMESTAMP(3) NOT NULL,
  "filingUrl" TEXT NOT NULL,
  
  -- Processing Status
  "status" TEXT NOT NULL, -- 'DISCOVERED', 'FETCHED', 'PARSED', 'SUMMARIZED', 'STORED', 'EMAILED', 'FAILED'
  "processedAt" TIMESTAMP(3) NOT NULL,
  "processingTimeMs" INTEGER,
  
  -- AI Processing
  "summaryGenerated" BOOLEAN DEFAULT false,
  "summaryTokens" INTEGER DEFAULT 0,
  "summaryCostUSD" DOUBLE PRECISION DEFAULT 0,
  "aiModel" TEXT,
  
  -- Email Delivery
  "emailsSent" INTEGER DEFAULT 0,
  "emailDeliveryStatus" TEXT, -- 'SENT', 'FAILED', 'BOUNCED', 'PENDING'
  
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FilingProcessingLog_pkey" PRIMARY KEY ("id")
);

-- User Notification Tracking
CREATE TABLE "UserNotificationLog" (
  "id" TEXT NOT NULL,
  "cronJobExecutionId" TEXT NOT NULL,
  "filingProcessingLogId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  
  -- Notification Details
  "notificationType" TEXT NOT NULL, -- 'FILING_SUMMARY', 'DIGEST', 'ALERT'
  "deliveryStatus" TEXT NOT NULL, -- 'SENT', 'FAILED', 'BOUNCED', 'OPENED', 'CLICKED'
  "sentAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  
  -- Cost Tracking
  "deliveryCostUSD" DOUBLE PRECISION DEFAULT 0,
  
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserNotificationLog_pkey" PRIMARY KEY ("id")
);

-- Cron Job Health Monitoring
CREATE TABLE "CronJobHealthMetric" (
  "id" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "metricName" TEXT NOT NULL,
  "metricValue" DOUBLE PRECISION NOT NULL,
  "metricUnit" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "cronJobExecutionId" TEXT,
  
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CronJobHealthMetric_pkey" PRIMARY KEY ("id")
);

-- Add Foreign Keys
ALTER TABLE "FilingProcessingLog" ADD CONSTRAINT "FilingProcessingLog_cronJobExecutionId_fkey" 
  FOREIGN KEY ("cronJobExecutionId") REFERENCES "CronJobExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNotificationLog" ADD CONSTRAINT "UserNotificationLog_cronJobExecutionId_fkey" 
  FOREIGN KEY ("cronJobExecutionId") REFERENCES "CronJobExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNotificationLog" ADD CONSTRAINT "UserNotificationLog_filingProcessingLogId_fkey" 
  FOREIGN KEY ("filingProcessingLogId") REFERENCES "FilingProcessingLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNotificationLog" ADD CONSTRAINT "UserNotificationLog_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CronJobHealthMetric" ADD CONSTRAINT "CronJobHealthMetric_cronJobExecutionId_fkey" 
  FOREIGN KEY ("cronJobExecutionId") REFERENCES "CronJobExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create Indexes for Performance
CREATE INDEX "CronJobExecution_jobName_startTime_idx" ON "CronJobExecution"("jobName", "startTime" DESC);
CREATE INDEX "CronJobExecution_status_createdAt_idx" ON "CronJobExecution"("status", "createdAt" DESC);
CREATE INDEX "FilingProcessingLog_ticker_processedAt_idx" ON "FilingProcessingLog"("ticker", "processedAt" DESC);
CREATE INDEX "FilingProcessingLog_status_createdAt_idx" ON "FilingProcessingLog"("status", "createdAt" DESC);
CREATE INDEX "UserNotificationLog_userId_sentAt_idx" ON "UserNotificationLog"("userId", "sentAt" DESC);
CREATE INDEX "UserNotificationLog_deliveryStatus_sentAt_idx" ON "UserNotificationLog"("deliveryStatus", "sentAt" DESC);
CREATE INDEX "CronJobHealthMetric_jobName_metricName_recordedAt_idx" ON "CronJobHealthMetric"("jobName", "metricName", "recordedAt" DESC);
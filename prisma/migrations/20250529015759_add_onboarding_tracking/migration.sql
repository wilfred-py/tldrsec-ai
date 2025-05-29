-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tutorialCompletedAt" TIMESTAMP(3),
ADD COLUMN     "tutorialProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tutorialSteps" JSONB;

-- CreateTable
CREATE TABLE "JobQueue" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "executionTime" INTEGER,
    "result" JSONB,

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLock" (
    "id" TEXT NOT NULL,
    "lockName" TEXT NOT NULL,
    "acquiredBy" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshedAt" TIMESTAMP(3),
    "released" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobQueue_status_scheduledFor_idx" ON "JobQueue"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "JobQueue_jobType_status_idx" ON "JobQueue"("jobType", "status");

-- CreateIndex
CREATE INDEX "JobQueue_idempotencyKey_idx" ON "JobQueue"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobQueue_createdAt_idx" ON "JobQueue"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobLock_lockName_key" ON "JobLock"("lockName");

-- CreateIndex
CREATE INDEX "JobLock_lockName_released_expiresAt_idx" ON "JobLock"("lockName", "released", "expiresAt");

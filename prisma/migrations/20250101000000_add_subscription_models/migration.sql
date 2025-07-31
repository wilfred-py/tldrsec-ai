-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('BASIC', 'PROFESSIONAL', 'PREMIUM');

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planType" "PlanType" NOT NULL DEFAULT 'BASIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filingType" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "accessionNumber" TEXT,
    "optimizationLevel" TEXT NOT NULL,
    "originalTokens" INTEGER,
    "optimizedTokens" INTEGER,
    "reductionPercentage" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "processingTimeMs" INTEGER,
    "subscriptionTier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilingUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsagePeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "planType" "PlanType" NOT NULL,
    "filingLimit" INTEGER NOT NULL,
    "filingsUsed" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_stripeCustomerId_key" ON "UserSubscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_stripeSubscriptionId_key" ON "UserSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "UserSubscription_planType_isActive_idx" ON "UserSubscription"("planType", "isActive");

-- CreateIndex
CREATE INDEX "FilingUsage_userId_createdAt_idx" ON "FilingUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FilingUsage_subscriptionTier_createdAt_idx" ON "FilingUsage"("subscriptionTier", "createdAt");

-- CreateIndex
CREATE INDEX "FilingUsage_filingType_createdAt_idx" ON "FilingUsage"("filingType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsagePeriod_userId_periodStart_key" ON "UsagePeriod"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "UsagePeriod_userId_periodEnd_idx" ON "UsagePeriod"("userId", "periodEnd");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingUsage" ADD CONSTRAINT "FilingUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsagePeriod" ADD CONSTRAINT "UsagePeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
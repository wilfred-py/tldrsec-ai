-- CreateTable
CREATE TABLE "SecCompanyCache" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecCompanyCache_pkey" PRIMARY KEY ("id")
);

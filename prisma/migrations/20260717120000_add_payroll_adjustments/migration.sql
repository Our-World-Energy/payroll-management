-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "misc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retroPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reim" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_adjustments_email_weekStart_key" ON "payroll_adjustments"("email", "weekStart");

-- Time Off cut off date (month name + day number, no year — recurs annually). Single-row table.
-- Pre-existing "cut_off_time" table (created outside migrations) had the wrong
-- column types (cut_off_month_name was a 1-byte "char", couldn't hold a real
-- month name) and no primary key — dropped and recreated properly. Table was empty.
DROP TABLE IF EXISTS "cut_off_time";

CREATE TABLE "cut_off_time" (
    "id" UUID NOT NULL,
    "cut_off_month_name" TEXT NOT NULL,
    "cut_off_month_no" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cut_off_time_pkey" PRIMARY KEY ("id")
);

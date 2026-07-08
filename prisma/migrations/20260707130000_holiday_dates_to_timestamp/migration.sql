-- AlterTable: widen date/arizonaDate from DATE to TIMESTAMP(3) so arizonaDate
-- can carry the actual Arizona wall-clock time, not just the calendar date.
ALTER TABLE "holidays"
  ALTER COLUMN "date" TYPE TIMESTAMP(3),
  ALTER COLUMN "arizonaDate" TYPE TIMESTAMP(3);

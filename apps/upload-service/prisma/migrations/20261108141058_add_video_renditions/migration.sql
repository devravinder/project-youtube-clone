-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "renditions" JSONB;

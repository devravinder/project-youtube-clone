-- AlterEnum
ALTER TYPE "VideoStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "videos" ALTER COLUMN "status" SET DEFAULT 'PENDING';

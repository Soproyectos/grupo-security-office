-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "iconUrl" VARCHAR(500),
ADD COLUMN     "imageUrl" VARCHAR(500),
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

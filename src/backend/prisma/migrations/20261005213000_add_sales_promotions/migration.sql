CREATE TYPE "PromotionAudience" AS ENUM ('GLOBAL', 'TEAM');
CREATE TABLE "sales_promotions" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "message" VARCHAR(2000) NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "audience" "PromotionAudience" NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_promotions_validity_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "sales_promotions_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sales_promotions_isActive_startsAt_endsAt_idx" ON "sales_promotions"("isActive", "startsAt", "endsAt");
CREATE INDEX "sales_promotions_createdById_idx" ON "sales_promotions"("createdById");

ALTER TABLE "sales_promotions" ADD COLUMN "flyer" TEXT;

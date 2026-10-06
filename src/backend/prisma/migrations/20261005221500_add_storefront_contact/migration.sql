-- CreateTable
CREATE TABLE "storefront_contacts" (
    "id" TEXT NOT NULL,
    "nationalPhone" TEXT NOT NULL,
    "whatsappPhone" TEXT NOT NULL,
    "salesPhone" TEXT,
    "email" TEXT NOT NULL,
    "businessHoursShort" TEXT NOT NULL,
    "businessHoursFull" TEXT NOT NULL,
    "sellWithUsMessage" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storefront_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storefront_contacts_updatedById_idx" ON "storefront_contacts"("updatedById");

-- AddForeignKey
ALTER TABLE "storefront_contacts" ADD CONSTRAINT "storefront_contacts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


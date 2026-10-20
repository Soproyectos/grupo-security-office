-- IMP-07B (07B) backend-esquema: perfiles de proveedor reutilizables y sus
-- equivalencias referencia externa → producto. Solo estructura, 0 datos
-- comerciales; no toca Price ni identidad de producto (regla 3).

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "thousandsSeparator" TEXT NOT NULL DEFAULT '',
    "decimalSeparator" TEXT NOT NULL DEFAULT '.',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "tariffs" JSONB NOT NULL,
    "expectedColumns" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_equivalences" (
    "id" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_equivalences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_providerName_key" ON "provider_profiles"("providerName");

-- CreateIndex
CREATE INDEX "provider_equivalences_productId_idx" ON "provider_equivalences"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_equivalences_providerProfileId_externalRef_key" ON "provider_equivalences"("providerProfileId", "externalRef");

-- AddForeignKey
ALTER TABLE "provider_equivalences" ADD CONSTRAINT "provider_equivalences_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

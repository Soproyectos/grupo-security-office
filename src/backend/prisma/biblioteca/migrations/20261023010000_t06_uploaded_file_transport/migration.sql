-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "detectedKind" TEXT,
    "originalName" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "ownerProductId" TEXT,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploaded_files_ownerProductId_idx" ON "uploaded_files"("ownerProductId");

-- CreateIndex
CREATE INDEX "uploaded_files_visibility_idx" ON "uploaded_files"("visibility");


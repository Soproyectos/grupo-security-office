-- Estructura de concesiones con procedencia (BASE-04 §5).
-- SOLO tablas/columnas/índices: ninguna fila, ningún UPDATE, ninguna
-- autoconcesión (fica BASE-04 regla 3). `UserPermission` queda intacto.

-- CreateEnum
CREATE TYPE "AccessScopeKind" AS ENUM ('own', 'team', 'list', 'product', 'global');

-- CreateEnum
CREATE TYPE "AccessSourceKind" AS ENUM ('manual', 'template');

-- CreateEnum
CREATE TYPE "AccessActorType" AS ENUM ('user', 'service', 'anonymous');

-- CreateEnum
CREATE TYPE "AccessOutcome" AS ENUM ('started', 'completed', 'denied', 'failed', 'partial', 'cancelled');

-- CreateTable
CREATE TABLE "access_states" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_states_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "access_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AccessSourceKind" NOT NULL,
    "templateId" TEXT,
    "catalogVersion" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "scopeKind" "AccessScopeKind" NOT NULL,
    "resourceId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_operations" (
    "id" TEXT NOT NULL,
    "actorType" "AccessActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "outcome" "AccessOutcome" NOT NULL DEFAULT 'started',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_sources_userId_idx" ON "access_sources"("userId");

-- CreateIndex
CREATE INDEX "access_grants_actionId_scopeKind_resourceId_idx" ON "access_grants"("actionId", "scopeKind", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "access_grants_sourceId_actionId_scopeKind_resourceId_key" ON "access_grants"("sourceId", "actionId", "scopeKind", "resourceId");

-- CreateIndex
CREATE INDEX "access_operations_actorType_actorId_actionId_targetId_idx" ON "access_operations"("actorType", "actorId", "actionId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "access_operations_actorType_actorId_idempotencyKey_key" ON "access_operations"("actorType", "actorId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "access_states" ADD CONSTRAINT "access_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_sources" ADD CONSTRAINT "access_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access_states"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "access_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

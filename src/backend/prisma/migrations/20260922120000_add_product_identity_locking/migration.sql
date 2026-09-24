/*
  Añade la capa de identidad curada de productos (ADR-002):

  - nameSource: origen del nombre ("sistema" | "curado").
  - nameLockedAt: marcador de identidad bloqueada (curada).
  - lastSeenAt: presencia en las listas mensuales.

  Migración puramente aditiva: columnas nuevas con default o nullable,
  sin backfill ni modificación de filas existentes.
*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "nameSource" TEXT NOT NULL DEFAULT 'sistema';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "nameLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

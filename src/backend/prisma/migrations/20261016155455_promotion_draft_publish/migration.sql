-- COM-08 §3/J1: separar preparar de publicar. Solo estructura, sin filas.
ALTER TABLE "sales_promotions" ADD COLUMN "publishedAt" TIMESTAMP(3);

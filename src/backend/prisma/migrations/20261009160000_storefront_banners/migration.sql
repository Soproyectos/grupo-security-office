CREATE TABLE "storefront_banners" (
    "id" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "publishedData" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "storefront_banners_pkey" PRIMARY KEY ("id")
);

-- Preserve the two existing home promotions when installing the editable system.
INSERT INTO "storefront_banners" ("id", "draft", "publishedData", "updatedAt")
SELECT id, content, content, CURRENT_TIMESTAMP FROM (VALUES
 ('3f7e1741-886c-4c54-931c-7aa577035e01', '{"title":"Hikvision y HiLook","imageDesktop":"/images/home/banner-hikvision.jpg","imageMobile":"","alt":"Grupo Security, soluciones Hikvision y HiLook","linkUrl":"/catalogo","buttonLabel":"Explorar catálogo","fit":"contain","focusX":50,"focusY":50,"position":0}'::jsonb),
 ('3f7e1741-886c-4c54-931c-7aa577035e02', '{"title":"Nuevas cámaras EZVIZ","imageDesktop":"/images/home/banner-ezviz.jpg","imageMobile":"","alt":"Nuevas cámaras EZVIZ H8X, H80x Dual y H90x Dual","linkUrl":"/catalogo","buttonLabel":"Conocer equipos","fit":"contain","focusX":50,"focusY":50,"position":1}'::jsonb)
) AS defaults(id, content);

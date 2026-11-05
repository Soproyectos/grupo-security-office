-- Synthetic T03 fixture subset + D1 file; no real data. Guarded caller only.
INSERT INTO brands(id,name,slug,"updatedAt") VALUES('b1','Marca sintética','marca-sintetica',CURRENT_TIMESTAMP);
INSERT INTO categories(id,name,slug,"updatedAt") VALUES('c1','Categoría sintética','categoria-sintetica',CURRENT_TIMESTAMP);
INSERT INTO categories(id,name,slug,"parentId","updatedAt") VALUES('c2','Subcategoría sintética','subcategoria-sintetica','c1',CURRENT_TIMESTAMP);
INSERT INTO listas(id,code,name,"createdById","updatedAt") VALUES('l1','LISTA-SINTETICA','Lista sintética','actor-externo-sintetico',CURRENT_TIMESTAMP);
INSERT INTO products(id,sku,name,"brandId","categoryId","listaId","updatedAt","technicalSpecs","extraAttributes") VALUES('p1','GS-TEST-SKU','Producto sintético','b1','c1','l1',CURRENT_TIMESTAMP,NULL,'null'::jsonb);
INSERT INTO product_revisions(id,"productId",status,version,content,"updatedAt",issues) VALUES('rev1','p1','SIN_REVISAR',1,'{}',CURRENT_TIMESTAMP,'null'::jsonb);
UPDATE products SET "publicRevisionId"='rev1' WHERE id='p1';
INSERT INTO product_catalog_spec_groups(id,"productId",key,title,position) VALUES('g1','p1','sintetico','Grupo sintético',0);
INSERT INTO product_catalog_spec_items(id,"groupId",label,value,position) VALUES('s1','g1','Dato sintético','Valor sintético',0);
INSERT INTO product_catalog_resources(id,"productId",kind,title,url) VALUES('r1','p1','DATASHEET','Documento sintético','https://example.invalid/ficha.pdf');
INSERT INTO product_images(id,"productId",url) VALUES('im1','p1','https://example.invalid/imagen.png');
INSERT INTO publication_events(id,"productId",action,result,"actorId") VALUES('ev1','p1','PUBLISH','ok','actor-externo-sintetico');
INSERT INTO product_changes(id,"productId",sku,field,source) VALUES('ch1','p1','GS-TEST-SKU','name','SYSTEM');
INSERT INTO price_lists(id,name,code,"updatedAt") VALUES('pl1','Tarifa sintética','TARIFA-SINTETICA',CURRENT_TIMESTAMP);
INSERT INTO prices(id,"productId","priceListId",value,"listaId","updatedAt") VALUES('pr1','p1','pl1',123.45,'l1',CURRENT_TIMESTAMP);
INSERT INTO price_import_revisions(id,"listaId","fileName","fileHash","fileSize","idempotencyKey","policyVersion","parserVersion",tariffs,summary,"updatedAt") VALUES('ir1','l1','sintetico.xlsx',repeat('a',64),1,'clave-sintetica','fixture','fixture','[]','{}',CURRENT_TIMESTAMP);
INSERT INTO price_import_revision_rows(id,"revisionId","rowNumber",sku,status,issues,resolution) VALUES('rr1','ir1',1,'SKU-PENDIENTE-SINTETICO','PENDING','[]','PENDING_PRODUCT');
INSERT INTO price_import_revision_prices(id,"revisionId","rowNumber",sku,"tariffCode","receivedValue","roundedValue","wasRounded",change) VALUES('rp1','ir1',1,'SKU-PENDIENTE-SINTETICO','TARIFA-SINTETICA','100','100',false,'new');
INSERT INTO import_mappings(id,name,mappings,"userId","updatedAt") VALUES('map1','Plantilla sintética','{"fixture_precision":9007199254740993,"fixture_decimal":1234567890.123456789}','actor-externo-sintetico',CURRENT_TIMESTAMP);
INSERT INTO import_sessions(id,"userId",data,"updatedAt") VALUES('session1','actor-externo-sintetico','{}',CURRENT_TIMESTAMP);
INSERT INTO provider_profiles(id,"providerName",sheet,tariffs,"expectedColumns","updatedAt") VALUES('prov1','Proveedor sintético','Hoja1','[]','[]',CURRENT_TIMESTAMP);
INSERT INTO provider_equivalences(id,"providerProfileId","externalRef","productId","updatedAt") VALUES('eq1','prov1','REF-SINTETICA','p1',CURRENT_TIMESTAMP);
INSERT INTO catalog_jobs(id,kind,"actorId",scope,"updatedAt") VALUES('job1','VALIDATION_SCAN','actor-externo-sintetico','{}',CURRENT_TIMESTAMP);
INSERT INTO catalog_job_units("jobId","unitId") VALUES('job1','p1');
INSERT INTO export_bundles(id,"jobId","actorId","bundleBytes","sizeBytes",sha256,"manifestJson") VALUES('bundle1','job1','actor-externo-sintetico',decode('00','hex'),1,repeat('a',64),'{}');

INSERT INTO uploaded_files(id,"mimeType",data,"sizeBytes",sha256,"detectedKind","originalName",visibility,"ownerProductId") VALUES('copy-file-fixture','image/png',decode('89504e4701020304','hex'),8,'cc1cdcbcf0bdb70801a2f0777e9f9c85571461df7f96d1d3f1476f420df37e38','IMAGE','fixture.png','PRIVATE','p1');

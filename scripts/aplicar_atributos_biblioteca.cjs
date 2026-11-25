'use strict';
// Additive, transactional loader. Default mode is read-only preflight.
// --apply requires separate human authorization; never publishes or updates existing rows.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const TABLES = {
  spec_definitions: { id:'text', key:'text', label:'text', dataType:'"SpecDataType"', unit:'text', isActive:'boolean' },
  spec_options: { specDefinitionId:'text', key:'text', label:'text', sortOrder:'integer', isActive:'boolean' },
  subcategory_specs: { subcategoryId:'text', specDefinitionId:'text', status:'"SubcategorySpecStatus"', isRequired:'boolean', isFilterable:'boolean', requiredReason:'text', sortOrder:'integer' },
  product_spec_values: { productId:'text', specDefinitionId:'text', stage:'"SpecValueStage"', dataType:'"SpecDataType"', valueText:'text', valueNumber:'numeric(18,6)', valueBoolean:'boolean', state:'"SpecValueState"' },
  product_spec_value_options: { productId:'text', specDefinitionId:'text', stage:'"SpecValueStage"', optionKey:'text', state:'"SpecValueState"' },
};
const KEYS = {
  spec_definitions:['key'], spec_options:['specDefinitionId','key'],
  subcategory_specs:['subcategoryId','specDefinitionId'],
  product_spec_values:['productId','specDefinitionId','stage'],
  product_spec_value_options:['productId','specDefinitionId','stage','optionKey'],
};
function check(condition, message) { if (!condition) throw Error(message); }
function normalized(row, columns) {
  return Object.fromEntries(columns.map(key => [key,
    key === 'valueNumber' && row[key] !== null && row[key] !== undefined
      ? Number(row[key]) : row[key] ?? null]));
}
function missingRows(table, wanted, existing) {
  const keys=KEYS[table], columns=Object.keys(TABLES[table]);
  const identity=row=>JSON.stringify(keys.map(key=>row[key]));
  const old=new Map(existing.map(row=>[identity(row),row]));
  const seen=new Set();
  return wanted.filter(row=>{
    const key=identity(row);
    check(!seen.has(key),'Duplicado en propuesta: '+table);
    seen.add(key);
    const prior=old.get(key);
    if (!prior) return true;
    check(isDeepStrictEqual(normalized(row,columns),normalized(prior,columns)),
      'Un registro existente difiere de la propuesta: '+table);
    return false;
  });
}
function prepare(dictionary, proposal, inventory, existing) {
  check(dictionary.sourceSha256===proposal.sourceSha256,'Hashes de propuesta incompatibles');
  check(dictionary.status==='PROPOSED' && proposal.status==='PROPOSED','Se requiere propuesta');
  const ids=new Map(existing.spec_definitions.map(d=>[d.key,d.id]));
  const definitions=dictionary.definitions.map(d=>{
    check(d.isActive===false,'Las definiciones deben permanecer inactivas');
    const id=ids.get(d.key)||crypto.randomUUID();ids.set(d.key,id);
    return {id,key:d.key,label:d.label,dataType:d.dataType,unit:d.unit??null,isActive:false};
  });
  const byKey=new Map(definitions.map(d=>[d.key,d]));
  const options=dictionary.definitions.flatMap(d=>d.options.map((o,index)=>({
    specDefinitionId:ids.get(d.key),key:o.key,label:o.label,sortOrder:index,isActive:false,
  })));
  const templates=dictionary.categoryTemplates.flatMap(c=>c.subcategories.flatMap(s=>s.specs.map(t=>{
    check(t.status==='PROPOSED' && t.isRequired===false,'Plantilla fuera del alcance aprobado');
    check(ids.has(t.specKey),'Definición de plantilla inexistente');
    return {subcategoryId:s.subcategoryId,specDefinitionId:ids.get(t.specKey),status:'PROPOSED',
      isRequired:false,isFilterable:!!t.isFilterable,requiredReason:null,sortOrder:t.sortOrder};
  })));
  const allowed=new Set(templates.map(t=>t.subcategoryId+'|'+t.specDefinitionId));
  const sourceProducts=new Map(inventory.products.map(p=>[p.id,p]));
  const values=proposal.values.map(v=>{
    check(v.stage==='WORKING' && v.state==='KNOWN','Valor fuera de WORKING/KNOWN');
    const definition=byKey.get(v.specKey),source=sourceProducts.get(v.productId);
    check(definition && source,'Referencia de propuesta inexistente');
    check(v.dataType===definition.dataType,'Tipo incompatible');
    check(allowed.has(v.subcategoryId+'|'+definition.id),'Valor sin plantilla');
    check(v.evidence.sourceSha256===proposal.sourceSha256,'Evidencia de otro inventario');
    const digest=sha(JSON.stringify({groups:source.publishedCatalogSpecGroups??[],
      technicalSpecs:source.publishedTechnicalSpecs??null}));
    check(digest===v.evidence.productSourceSha256,'Evidencia del producto cambió');
    check(source.subcategoryId===v.subcategoryId && source.sku===v.sku,'Identidad inconsistente');
    const shape={productId:v.productId,specDefinitionId:definition.id,stage:'WORKING',
      dataType:v.dataType,valueText:v.valueText??null,valueNumber:v.valueNumber??null,
      valueBoolean:null,state:'KNOWN'};
    check(
      v.dataType==='TEXT' ? typeof shape.valueText==='string' && shape.valueNumber===null
      : v.dataType==='NUMBER' ? Number.isFinite(shape.valueNumber) && shape.valueText===null
      : v.dataType==='MULTI_OPTION' && Array.isArray(v.optionKeys) && v.optionKeys.length>0
        && shape.valueText===null && shape.valueNumber===null,
      'Forma de valor inválida');
    return shape;
  });
  const validOptions=new Set(options.map(o=>o.specDefinitionId+'|'+o.key));
  const selections=proposal.values.flatMap(v=>(v.optionKeys??[]).map(optionKey=>{
    const specDefinitionId=ids.get(v.specKey);
    check(validOptions.has(specDefinitionId+'|'+optionKey),'Opción fuera del diccionario');
    return {productId:v.productId,specDefinitionId,stage:'WORKING',optionKey,state:'KNOWN'};
  }));
  const wanted={spec_definitions:definitions,spec_options:options,subcategory_specs:templates,
    product_spec_values:values,product_spec_value_options:selections};
  const inserts=Object.fromEntries(Object.entries(wanted).map(([table,rows])=>[
    table,missingRows(table,rows,existing[table])]));
  return {wanted,inserts};
}
async function readTables(db) {
  const rows={};
  for (const table of Object.keys(TABLES)) rows[table]=(await db.query('SELECT * FROM '+table)).rows;
  return rows;
}
async function insertRows(db, table, rows) {
  if (!rows.length) return;
  const columns=Object.keys(TABLES[table]);
  const extra=table==='spec_definitions'||table==='subcategory_specs'
    ? ',"createdAt","updatedAt"' : table==='product_spec_values' ? ',"updatedAt"' : '';
  const expressions=extra===',\"createdAt\",\"updatedAt\"' ? ',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP'
    : extra ? ',CURRENT_TIMESTAMP' : '';
  const names=columns.map(c=>'"'+c+'"').join(',');
  const types=columns.map(c=>'"'+c+'" '+TABLES[table][c]).join(',');
  await db.query('INSERT INTO '+table+' ('+names+extra+') SELECT '+names+expressions+
    ' FROM jsonb_to_recordset($1::jsonb) AS x('+types+')',[JSON.stringify(rows)]);
}
async function publicStamp(db) {
  return (await db.query('SELECT count(*)::int AS products, md5(COALESCE(jsonb_agg('+
    'jsonb_build_array(p.id,p."publicRevisionId",p."lifecycleStatus",md5(r.content::text)) '+
    'ORDER BY p.id),\'[]\'::jsonb)::text) AS digest FROM products p LEFT JOIN product_revisions r '+
    'ON r.id=p."publicRevisionId"')).rows[0];
}
async function run({db,dictionary,proposal,inventory,apply=false,reportPath}) {
  let committed=false;
  await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await db.query("SET LOCAL statement_timeout='25000ms'");
    await db.query("SET LOCAL lock_timeout='5000ms'");
    check((await db.query('SELECT current_database() AS name')).rows[0].name==='grupo_security',
      'Base inesperada');
    if (apply) {
      await db.query('SELECT pg_advisory_xact_lock(734021,20261124)');
      await db.query('LOCK TABLE '+Object.keys(TABLES).join(',')+' IN SHARE ROW EXCLUSIVE MODE');
    }
    const originalStamp=await publicStamp(db);
    const live=(await db.query('SELECT p.id,p.sku,p."subcategoryId",r.content->>\'categoryId\' AS "publishedCategoryId",'+
      'r.content->\'catalogSpecGroups\' AS groups,r.content->\'technicalSpecs\' AS specs FROM products p '+
      'LEFT JOIN product_revisions r ON r.id=p."publicRevisionId" AND r.status=\'PUBLICADA\''+
      (apply?' FOR SHARE OF p':''))).rows;
    check(live.length===inventory.products.length,'Cambió el inventario de productos');
    const liveById=new Map(live.map(p=>[p.id,p]));
    for (const source of inventory.products) {
      const current=liveById.get(source.id);
      check(current && current.sku===source.sku && current.subcategoryId===source.subcategoryId
        && current.publishedCategoryId===source.publishedCategoryId
        && isDeepStrictEqual(current.groups,source.publishedCatalogSpecGroups)
        && isDeepStrictEqual(current.specs,source.publishedTechnicalSpecs),
        'Cambió una ficha o su clasificación; regenerar y revisar propuestas');
    }
    if (apply) await db.query('SELECT r.id FROM product_revisions r JOIN products p ON p."publicRevisionId"=r.id FOR SHARE OF r');
    const liveSubcategories=(await db.query('SELECT id,"categoryId" FROM subcategories'+
      (apply?' FOR SHARE':''))).rows;
    const subById=new Map(liveSubcategories.map(s=>[s.id,s.categoryId]));
    for (const category of dictionary.categoryTemplates) for (const sub of category.subcategories) {
      check(subById.get(sub.subcategoryId)===category.categoryId,'Subcategoría fuera de su categoría');
    }
    const before=await readTables(db);
    const plan=prepare(dictionary,proposal,inventory,before);
    const counts=Object.fromEntries(Object.entries(plan.inserts).map(([t,rows])=>[t,rows.length]));
    const report={batchId:crypto.randomUUID(),startedAt:new Date().toISOString(),
      sourceSha256:proposal.sourceSha256,dictionarySha256:sha(JSON.stringify(dictionary)),
      proposalSha256:sha(JSON.stringify(proposal)),mode:apply?'APPLY':'READ_ONLY_PREFLIGHT',
      publicBefore:originalStamp,beforeCounts:Object.fromEntries(Object.entries(before).map(([t,r])=>[t,r.length])),
      insertedCounts:counts,createdRows:plan.inserts,committed:false};
    if (!apply) {
      await db.query('ROLLBACK');
      return {...report,createdRows:undefined};
    }
    // Persist the exact pre-commit plan for recovery; no credentials or private customer data.
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    for (const table of Object.keys(TABLES)) await insertRows(db,table,plan.inserts[table]);
    // Audit only products that receive new working values. No invented user identity.
    const changed=[...new Set(plan.inserts.product_spec_values.map(v=>v.productId))];
    if (changed.length) {
      const audit=changed.map(productId=>({
        id:crypto.randomUUID(),productId,sku:liveById.get(productId).sku,
        field:'keySpecs:WORKING',oldValue:null,
        newValue:{specKeys:proposal.values.filter(v=>v.productId===productId).map(v=>v.specKey)},
        source:'SYSTEM',sourceRef:'attribute-load:'+report.sourceSha256,
        batchId:report.batchId,
      }));
      await db.query('INSERT INTO product_changes (id,"productId",sku,field,"oldValue","newValue",source,"sourceRef","batchId","createdAt") '+
        'SELECT id,"productId",sku,field,"oldValue","newValue",source,"sourceRef","batchId",CURRENT_TIMESTAMP '+
        'FROM jsonb_to_recordset($1::jsonb) x(id text,"productId" text,sku text,field text,'+
        '"oldValue" jsonb,"newValue" jsonb,source text,"sourceRef" text,"batchId" text)',[JSON.stringify(audit)]);
      report.auditRows=audit.length;
    }
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    const after=await readTables(db);
    for (const table of Object.keys(TABLES)) {
      check(missingRows(table,plan.wanted[table],after[table]).length===0,'Verificación de carga falló');
      check(after[table].length===before[table].length+counts[table],'Conteo final inesperado');
    }
    const publicAfter=await publicStamp(db);
    check(isDeepStrictEqual(originalStamp,publicAfter),'Cambió la publicación durante la carga');
    check(after.product_spec_values.filter(v=>v.stage==='PUBLISHED').length===
      before.product_spec_values.filter(v=>v.stage==='PUBLISHED').length,'Cambió una etapa publicada');
    report.afterCounts=Object.fromEntries(Object.entries(after).map(([t,r])=>[t,r.length]));
    report.publicAfter=publicAfter;
    await db.query('COMMIT');committed=true;
    report.committed=true;report.finishedAt=new Date().toISOString();
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    return {...report,createdRows:undefined};
  } catch (error) {
    if (!committed) await db.query('ROLLBACK').catch(()=>{});
    if (committed) throw Error('La carga confirmó COMMIT; revisar informe local antes de reintentar');
    throw error;
  }
}
async function main() {
  const args=process.argv.slice(2),apply=args.includes('--apply');
  check(args.every(a=>['--apply','--preflight'].includes(a)),'Argumento inválido');
  const artifactDir=path.resolve(__dirname,'../data/atributos-biblioteca-20261124');
  const dictionary=JSON.parse(fs.readFileSync(path.join(artifactDir,'dictionary.json')));
  const proposal=JSON.parse(fs.readFileSync(path.join(artifactDir,'proposal.json')));
  const sourceBytes=fs.readFileSync(path.join(os.tmpdir(),'gs-attributes-db-20261124.json'));
  check(sha(sourceBytes)===proposal.sourceSha256,'El inventario local no coincide');
  const templateCount=dictionary.categoryTemplates.reduce((n,c)=>n+c.subcategories.reduce((m,s)=>m+s.specs.length,0),0);
  check(dictionary.definitions.length===55 && proposal.values.length===2035 && templateCount===206,'Cantidad fuera de aprobación');
  const connection=new URL(process.env.DATABASE_URL);
  check(connection.hostname==='127.0.0.1' && connection.port==='55432'
    && connection.pathname==='/grupo_security','Conexión fuera del túnel autorizado');
  const {Client}=require(require.resolve('pg',{paths:[path.resolve(__dirname,'../src/backend')]}));
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
  try {
    await db.connect();
    const reportPath=path.join(artifactDir,'apply-'+Date.now()+'.json');
    const result=await run({db,dictionary,proposal,inventory:JSON.parse(sourceBytes),apply,reportPath});
    console.log(JSON.stringify({...result,reportPath:apply?reportPath:undefined},null,2));
  } finally { await db.end(); }
}
if(require.main===module) main().catch(error=>{
  console.error('Carga detenida: '+(error.code||error.message));process.exitCode=1;
});
module.exports={prepare,missingRows,run,TABLES};


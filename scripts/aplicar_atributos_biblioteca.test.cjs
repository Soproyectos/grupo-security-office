'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare,missingRows,run,TABLES}=require('./aplicar_atributos_biblioteca.cjs');
const {buildArtifacts}=require('./proponer_atributos_biblioteca.cjs');
function fixture() {
  const product={id:'p',sku:'TEST',category:'alarmas',publishedCategoryId:'c',subcategoryId:'s',
    publishedTechnicalSpecs:[],publishedCatalogSpecGroups:[{items:[
      {label:'Zonas',value:'48'},{label:'Protocolo',value:'TCP, HTTPS'},
    ]}]};
  const inventory={products:[product],categories:[{id:'c',name:'Alarmas',slug:'alarmas'}]};
  const artifacts=buildArtifacts(inventory,'test-source');
  return {...artifacts,inventory,empty:Object.fromEntries(Object.keys(TABLES).map(t=>[t,[]]))};
}
test('load plan creates only unpublished draft records with valid choices',()=>{
  const f=fixture(),p=prepare(f.dictionary,f.proposal,f.inventory,f.empty);
  assert.ok(p.wanted.spec_definitions.every(d=>!d.isActive));
  assert.ok(p.wanted.spec_options.every(d=>!d.isActive));
  assert.ok(p.wanted.subcategory_specs.every(t=>t.status==='PROPOSED'&&!t.isRequired));
  assert.ok(p.wanted.product_spec_values.every(v=>v.stage==='WORKING'&&v.state==='KNOWN'));
  assert.equal(p.wanted.product_spec_value_options.length,2);
});
test('second identical plan performs no writes',()=>{
  const f=fixture(),first=prepare(f.dictionary,f.proposal,f.inventory,f.empty);
  const second=prepare(f.dictionary,f.proposal,f.inventory,first.wanted);
  assert.ok(Object.values(second.inserts).every(rows=>rows.length===0));
});
test('existing edits are rejected instead of overwritten',()=>{
  const f=fixture(),first=prepare(f.dictionary,f.proposal,f.inventory,f.empty);
  first.wanted.product_spec_values[0].state='UNKNOWN';
  assert.throws(()=>prepare(f.dictionary,f.proposal,f.inventory,first.wanted),/existente difiere/);
});
test('decimal storage representation compares semantically',()=>{
  const row={productId:'p',specDefinitionId:'d',stage:'WORKING',dataType:'NUMBER',
    state:'KNOWN',valueNumber:48,valueText:null,valueBoolean:null};
  assert.deepEqual(missingRows('product_spec_values',[row],[{...row,valueNumber:'48.000000'}]),[]);
});
test('published values, invalid options and changed evidence are rejected',()=>{
  for(const mutate of [
    f=>{f.proposal.values[0].stage='PUBLISHED';},
    f=>{f.proposal.values.find(v=>v.optionKeys).optionKeys=['not-in-dictionary'];},
    f=>{f.proposal.values[0].evidence.productSourceSha256='changed';},
  ]) {
    const f=fixture();mutate(f);
    assert.throws(()=>prepare(f.dictionary,f.proposal,f.inventory,f.empty));
  }
});
test('insertion error rolls back the whole operation',async()=>{
  const f=fixture(),calls=[];
  const db={async query(sql) {
    calls.push(sql);
    if(sql.startsWith('SELECT current_database'))return {rows:[{name:'grupo_security'}]};
    if(sql.startsWith('SELECT count(*)'))return {rows:[{products:1,digest:'same'}]};
    if(sql.startsWith('SELECT p.id'))return {rows:[{
      id:'p',sku:'TEST',subcategoryId:'s',publishedCategoryId:'c',
      groups:f.inventory.products[0].publishedCatalogSpecGroups,specs:[],
    }]};
    if(sql.startsWith('SELECT id,"categoryId"'))return {rows:[{id:'s',categoryId:'c'}]};
    if(sql.startsWith('SELECT *'))return {rows:[]};
    if(sql.startsWith('INSERT'))throw Error('injected insertion error');
    return {rows:[]};
  }};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gs-attr-test-'));
  const reportPath=path.join(dir,'report.json');
  try {
    await assert.rejects(run({db,...f,apply:true,reportPath}),/injected/);
    assert.ok(calls.includes('ROLLBACK'));
    assert.ok(!calls.includes('COMMIT'));
  } finally {if(fs.existsSync(reportPath))fs.unlinkSync(reportPath);fs.rmdirSync(dir);}
});
test('changed source aborts before any insertion',async()=>{
  const f=fixture(),calls=[];
  const db={async query(sql) {
    calls.push(sql);
    if(sql.startsWith('SELECT current_database'))return {rows:[{name:'grupo_security'}]};
    if(sql.startsWith('SELECT count(*)'))return {rows:[{products:1,digest:'same'}]};
    if(sql.startsWith('SELECT p.id'))return {rows:[]};
    return {rows:[]};
  }};
  await assert.rejects(run({db,...f,apply:true}),/inventario/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.some(sql=>sql.startsWith('INSERT')));
});


test('successful transaction verifies rows and a repeated run inserts nothing',async()=>{
  const f=fixture(),tables=structuredClone(f.empty),calls=[];
  const db={async query(sql,params) {
    calls.push(sql);
    if(sql.startsWith('SELECT current_database'))return {rows:[{name:'grupo_security'}]};
    if(sql.startsWith('SELECT count(*)'))return {rows:[{products:1,digest:'same'}]};
    if(sql.startsWith('SELECT p.id'))return {rows:[{
      id:'p',sku:'TEST',subcategoryId:'s',publishedCategoryId:'c',
      groups:f.inventory.products[0].publishedCatalogSpecGroups,specs:[],
    }]};
    if(sql.startsWith('SELECT id,"categoryId"'))return {rows:[{id:'s',categoryId:'c'}]};
    if(sql.startsWith('SELECT *'))return {rows:structuredClone(tables[sql.split(' ').at(-1)])};
    if(sql.startsWith('INSERT INTO ')) {
      const table=sql.split(' ')[2];
      if(tables[table]) tables[table].push(...JSON.parse(params[0]));
    }
    return {rows:[]};
  }};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gs-attr-success-'));
  const reportPath=path.join(dir,'report.json');
  try {
    const first=await run({db,...f,apply:true,reportPath});
    assert.equal(first.committed,true);
    assert.equal(first.afterCounts.product_spec_values,2);
    const before=calls.length;
    const second=await run({db,...f,apply:true,reportPath});
    assert.equal(second.committed,true);
    assert.ok(Object.values(second.insertedCounts).every(count=>count===0));
    assert.ok(!calls.slice(before).some(sql=>sql.startsWith('INSERT')));
  } finally {if(fs.existsSync(reportPath))fs.unlinkSync(reportPath);fs.rmdirSync(dir);}
});


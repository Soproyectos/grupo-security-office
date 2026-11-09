import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../src/index.css'
import UserAccessAssignments from '../src/features/users/components/UserAccessAssignments'
import Header from '../src/components/layout/Header'
import AdminLayout from '../src/components/layout/AdminLayout'
import { useAuthStore } from '../src/stores/auth.store'
import { ACTION_LABELS, panelAccess, hasAssignedAction, userAccessKey } from '../src/features/users/access'
import { marketingPermissions, hasAssignedMarketingPanel } from '../src/features/marketing/marketing-access'
import { agendaAccess } from '../src/features/agenda/agenda-access'
import api from '../src/services/api'

// Isolated research fixture: no persistent auth storage and no requests to the backend.
Object.defineProperty(window, 'EventSource', { value: undefined, configurable: true })
useAuthStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } })
useAuthStore.setState({ isAuthenticated: true, user: { id: 'ux-reviewer', name: 'Administrador de demostración', email: 'admin@example.invalid', roles: ['Super Admin'], permissions: [] } })
const definitions = Object.entries({ ...ACTION_LABELS, 'users:read': 'Consultar usuarios', 'quotes:discount': 'Aplicar descuento' })
  .filter(([id]) => /^(customers|quotes|activities|targets|teamInsights|commercialPromotions|users|marketing|libraryStats):/.test(id))
  .map(([id, label]) => ({ id, label, purpose: `Permite ${label.toLowerCase()}.`, enabled: true, allowedScopes: /^(marketing|libraryStats):/.test(id) ? ['global'] : ['own', 'team', 'global'], dependencies: id.endsWith(':read') || id.startsWith('libraryStats:') ? [] : [`${id.split(':')[0]}:read`] }))
const scenarios = [
  { id: 'super', label: 'Super Admin sin asignaciones', name: 'Administrador de ejemplo', role: 'Super Admin' },
  { id: 'mixed', label: 'Comercial y Biblioteca', name: 'Ana de ejemplo', role: 'Vendedor' },
  { id: 'loose', label: 'Acciones sin habilitar Marketing', name: 'Luis de ejemplo', role: 'Operador' },
]
const source = (id, kind, templateId) => ({ id, kind, templateId, catalogVersion: 'ux-fixture', grantedById: 'ux-reviewer', reason: null })
const DEMO_KEY='ux-access-demo-v1'
function readSaved(){try{return JSON.parse(sessionStorage.getItem(DEMO_KEY)??'{}')}catch{return {}}}
function persistSaved(value){try{sessionStorage.setItem(DEMO_KEY,JSON.stringify(value))}catch{/* Demo persistence is best effort. */}}
function makeState(id) {
  const grants = id === 'super' ? [] : [
    ...['marketing:read','marketing:edit'].map(actionId => ({ actionId, scope: 'global', sourceId: 'manual' })),
    ...(id === 'mixed' ? [
      ...['customers:read','customers:create','quotes:read','quotes:create'].map(actionId => ({ actionId, scope: 'own', sourceId: 'seller' })),
      ...['products:read','products:write','products:notes','prices:read'].map(actionId => ({ actionId, scope: 'global', sourceId: 'library' })),
    ] : []),
  ]
  return {
    catalogVersion: 'ux-fixture', accessVersion: 1, grants,
    sources: id === 'super' ? [] : [source('manual','manual',null), ...(id === 'mixed' ? [source('seller','template','vendedor'),source('library','template','biblioteca-seleccion')] : [])],
    actions: definitions,
    packages: [
      { id:'vendedor', name:'Vendedor', applied:id === 'mixed', sourceId:id === 'mixed' ? 'seller' : null, selections:[{ actionId:'customers:read',scope:'own' },{ actionId:'quotes:read',scope:'own' }] },
      { id:'marketing-consulta', name:'Consultar Marketing', applied:false,sourceId:null,selections:[{actionId:'marketing:read',scope:'global'}] },
      { id:'marketing-edicion', name:'Preparar contenido', applied:false,sourceId:null,selections:[{actionId:'marketing:read',scope:'global'},{actionId:'marketing:edit',scope:'global'}] },
      { id:'biblioteca-publicacion', name:'Publicar en tienda', applied:false,sourceId:null,selections:[{actionId:'products:publish',scope:'global'}] },
    ],
  }
}
let state = makeState('super')
let people = []
api.defaults.adapter = async config => {
  const path = config.url ?? ''
  let data
  if (path === '/auth/profile') data = { id:'ux-reviewer', name:'Administrador de demostración', email:'admin@example.invalid', roles:['Super Admin'], permissions:[] }
  else if (path === '/users/ux-reviewer/access') data = makeState('super')
  else if (path.startsWith('/users/demo-user/access')) {
    if (config.method === 'get') data = structuredClone(state)
    else {
      const body = config.data ? JSON.parse(config.data) : {}
      const version = body.expectedVersion ?? config.params?.expectedVersion
      if (version !== state.accessVersion) throw new Error('La demostración cambió. Vuelve a abrir el caso.')
      const library = path.endsWith('/library')
      const isPackage = body.packageId || path.includes('/packages/')
      if (isPackage) {
        const pkg = state.packages.find(item => item.id === body.packageId || path.endsWith('/' + item.id))
        if (!pkg) throw new Error('Paquete de demostración no disponible')
        state.grants = state.grants.filter(grant => grant.sourceId !== pkg.id)
        state.sources = state.sources.filter(item => item.id !== pkg.id)
        pkg.applied = config.method !== 'delete'
        pkg.sourceId = pkg.applied ? pkg.id : null
        if (pkg.applied) { state.sources.push(source(pkg.id,'template',pkg.id)); state.grants.push(...pkg.selections.map(grant => ({...grant,sourceId:pkg.id}))) }
      } else {
        const target = library ? 'library' : 'manual'
        state.grants = state.grants.filter(grant => grant.sourceId !== target)
        state.sources = state.sources.filter(item => item.id !== target)
        const next = config.method === 'delete' ? [] : library ? body.actionIds.map(actionId => ({actionId,scope:'global'})) : body.grants
        if (next.length) { state.sources.push(source(target,library ? 'template' : 'manual',library ? 'biblioteca-seleccion' : null)); state.grants.push(...next.map(grant => ({...grant,sourceId:target}))) }
      }
      state.accessVersion++
      data = {userId:'demo-user',sourceId:'demo',accessVersion:state.accessVersion,changed:true,grants:structuredClone(state.grants)}
    }
  } else if (path.startsWith('/users?')) {
    const term = new URLSearchParams(path.split('?')[1]).get('search')?.toLowerCase() ?? ''
    const filtered = people.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(term))
    data = { data:filtered,meta:{total:filtered.length,skip:0,take:50} }
  } else if (path === '/users/demo-user') data = people[0]
  else throw new Error('La demostración no permite peticiones externas: ' + path)
  return {data:{data},status:200,statusText:'OK',headers:{},config}
}
const FOCUS='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
const permissionGroups = [
  { panel:'Biblioteca', id:'library', groups:[
    {label:'Productos',items:[['products:read','Consultar productos'],['products:write','Editar fichas'],['products:notes','Notas internas']]},
    {label:'Precios',items:[['prices:read','Consultar precios'],['prices:preview','Revisar cambios']]},
    {label:'Importaciones',items:[['imports:read','Consultar importaciones'],['imports:import','Importar']]},
  ]},
  { panel:'Marketing', id:'marketing', groups:[{label:'Contenido',items:[['marketing:read','Consultar'],['marketing:create','Crear'],['marketing:edit','Editar'],['marketing:publish','Publicar'],['marketing:delete','Eliminar']]}]},
  { panel:'Comercial', id:'commercial', groups:[
    {label:'Clientes',items:[['customers:read','Consultar clientes'],['customers:create','Crear clientes'],['customers:update','Editar clientes']]},
    {label:'Cotizaciones',items:[['quotes:read','Consultar cotizaciones'],['quotes:create','Crear cotizaciones'],['quotes:discount','Aplicar descuentos']]},
  ]},
  { panel:'Precios', id:'prices', groups:[{label:'Precios',items:[['prices:read','Consultar precios'],['prices:preview','Revisar cambios']]}]},
  { panel:'Importaciones', id:'imports', groups:[{label:'Importaciones',items:[['imports:read','Consultar importaciones'],['imports:import','Importar']]}]},
]
function ProposedSummary({ scenario, onSelect, draft, setDraft, onSave, onDiscard, dirty, status }) {
  const [search, setSearch] = useState('')
  const [selectedPanel, setSelectedPanel] = useState('Comercial')
  const roles = [scenario.role]
  const working=draft??state
  const input = {roles,grants:working.grants,sources:working.sources,packages:working.packages,status:'ready'}
  const commercial = panelAccess(input,'commercial')
  const library = panelAccess(input,'catalog')
  const marketing = marketingPermissions(input)
  const agenda = agendaAccess(input)
  const superAdmin = scenario.role === 'Super Admin'
  const sourceText = superAdmin ? 'Rol Super Admin' : 'Paquete Vendedor'
  const rows = [
    {label:'Comercial',allowed:commercial.hasAnyPanel,what:commercial.hasAnyPanel ? (superAdmin ? `Puede usar ${commercial.tabs.map(tab=>tab.label).join(', ')}.` : 'Consulta y crea clientes y cotizaciones.') : 'No tiene accesos comerciales habilitados.',scope:!commercial.hasAnyPanel?'Sin acceso':superAdmin?'Toda la empresa':'Solo su información',origin:commercial.hasAnyPanel?sourceText:'Sin asignaciones',details:definitions.filter(action=>/^(customers|quotes|targets|teamInsights|commercialPromotions):/.test(action.id) && hasAssignedAction(input,[action.id])).map(action=>action.label)},
    {label:'Biblioteca',allowed:library.hasAnyPanel,what:library.hasAnyPanel ? (superAdmin ? `Puede usar ${library.tabs.map(tab=>tab.label).join(', ')}.` : 'Consulta y edita productos; ve precios y notas.') : 'No tiene pestañas de Biblioteca habilitadas.',scope:library.hasAnyPanel?'Información de Biblioteca':'Sin acceso',origin:superAdmin?sourceText:library.hasAnyPanel?'Selección de Biblioteca':'Sin asignaciones',details:library.hasAnyPanel?['products:read','products:write','products:notes','prices:read','prices:preview','imports:read','masters:read'].filter(action=>hasAssignedAction(input,[action])).map(action=>({'products:read':'Consultar productos','products:write':'Editar fichas de producto','products:notes':'Ver notas internas','prices:read':'Consultar precios','prices:preview':'Revisar cambios de precios','imports:read':'Consultar importaciones','masters:read':'Consultar clasificaciones y tarifas'}[action])):[]},
    {label:'Marketing',allowed:hasAssignedMarketingPanel(input),what:hasAssignedMarketingPanel(input) ? ['read','create','edit','publish','delete'].filter(action=>marketing[action]).map(action=>({read:'Consultar contenido',create:'Crear',edit:'Editar',publish:'Publicar y retirar',delete:'Eliminar'}[action])).join(', ') : 'Requiere un paquete de Marketing.',scope:'Contenido de la tienda',origin:superAdmin?sourceText:'Requiere un paquete de Marketing',details:!hasAssignedMarketingPanel(input)&&working.grants.some(grant=>grant.actionId.startsWith('marketing:'))?['Hay acciones registradas, pero no hay un paquete de Marketing aplicado. Las acciones solas no habilitan este panel.']:[]},
    {label:'Agenda',allowed:Boolean(agenda.canCreateOwn||agenda.canUseTeam),what:agenda.canUseTeam?`Puede consultar la agenda del equipo${agenda.canAssignOthers?' y asignar actividades':''}.`:'Crea y completa sus actividades.',scope:agenda.canUseTeam?'Su información y la de su equipo':'Solo su información',origin:superAdmin?sourceText:'Acceso base de su rol',details:[]},
  ]
  const panelRows = [
    {label:'Comercial',allowed:commercial.hasAnyPanel,description:'Clientes, cotizaciones y actividad comercial.',origin:commercial.hasAnyPanel?sourceText:'Sin asignaciones'},
    {label:'Biblioteca',allowed:library.hasAnyPanel,description:'Productos, precios y listas comerciales.',origin:superAdmin?sourceText:library.hasAnyPanel?'Selección de Biblioteca':'Sin asignaciones'},
    {label:'Marketing',allowed:hasAssignedMarketingPanel(input),description:'Contenido y publicaciones de la tienda.',origin:superAdmin?sourceText:hasAssignedMarketingPanel(input)?'Paquete de Marketing':working.grants.some(grant=>grant.actionId.startsWith('marketing:'))?'Acciones individuales; falta paquete':'Sin asignaciones'},
    {label:'Agenda',allowed:Boolean(agenda.canCreateOwn||agenda.canUseTeam),description:'Actividades propias y del equipo.',origin:superAdmin?sourceText:'Acceso base de su rol'},
  ]
  const selectedDefinition = permissionGroups.find(group=>group.panel===selectedPanel)
  const inherited = superAdmin
  const sourceFor = (actionId) => working.grants.find(grant=>grant.actionId===actionId)?.sourceId
  const setGrant=(actionId,checked)=>setDraft(current=>{const next=structuredClone(current??working);const sourceId='manual';next.grants=next.grants.filter(grant=>!(grant.actionId===actionId&&grant.sourceId===sourceId));if(checked)next.grants.push({actionId,scope:actionId.startsWith('marketing:')?'global':actionId.startsWith('products:')||actionId.startsWith('prices:')?'global':'own',sourceId});if(next.grants.some(grant=>grant.sourceId===sourceId)){if(!next.sources.some(item=>item.id===sourceId))next.sources.push(source(sourceId,'manual',null))}else next.sources=next.sources.filter(item=>item.id!==sourceId);return next})
  const togglePackage=(packageId,enabled)=>setDraft(current=>{const next=structuredClone(current??working);const pkg=next.packages.find(item=>item.id===packageId);if(!pkg)return next;const oldSource=pkg.sourceId??pkg.id;next.grants=next.grants.filter(grant=>grant.sourceId!==oldSource&&grant.sourceId!==pkg.id);next.sources=next.sources.filter(item=>item.id!==oldSource&&item.id!==pkg.id);pkg.applied=enabled;pkg.sourceId=enabled?pkg.id:null;if(enabled){next.sources.push(source(pkg.id,'template',pkg.id));next.grants.push(...pkg.selections.map(grant=>({...grant,sourceId:pkg.id})))}return next})
  const setLibrarySelection=(actionId,checked)=>setDraft(current=>{const next=structuredClone(current??working);const sourceId='library';const ids=new Set(next.grants.filter(grant=>grant.sourceId===sourceId).map(grant=>grant.actionId));checked?ids.add(actionId):ids.delete(actionId);next.grants=next.grants.filter(grant=>grant.sourceId!==sourceId);next.sources=next.sources.filter(item=>item.id!==sourceId);if(ids.size){next.sources.push(source(sourceId,'template','biblioteca-seleccion'));next.grants.push(...[...ids].map(id=>({actionId:id,scope:'global',sourceId})))}return next})
  return <div className="ux-proposal-layout">
    <label className="ux-mobile-user">Usuario<select value={scenario.id} onChange={event=>onSelect(event.target.value)} className={`ux-search ${FOCUS}`}>{scenarios.map(person=><option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
    <aside className="ux-directory"><h2 className="font-condensed text-lg font-semibold">Usuarios</h2><label className="ux-search-label">Buscar usuario<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nombre o rol" className={`ux-search ${FOCUS}`}/></label><div className="ux-user-list">{scenarios.filter(person=>`${person.name} ${person.role}`.toLowerCase().includes(search.toLowerCase())).map(person=><button type="button" key={person.id} aria-pressed={scenario.id===person.id} onClick={()=>onSelect(person.id)} className={`ux-user ${scenario.id===person.id?'ux-user-selected':''} ${FOCUS}`}><strong>{person.name}</strong><span>{person.role}</span></button>)}</div><p className="mt-3 text-xs text-[var(--color-text-secondary)]">3 usuarios ficticios para revisar los casos.</p></aside>
    <section aria-label="Paneles disponibles" className="ux-panels"><header className="ux-column-heading"><h1 className="font-condensed text-base font-semibold">Paneles</h1><p className="text-xs text-[var(--color-text-secondary)]">Accesos de {scenario.name} · {scenario.role}</p></header>
      {superAdmin&&<p role="status" className="ux-role-note border-y border-[var(--color-border)] py-2 text-xs"><strong>Acceso por rol Super Admin.</strong> Las casillas heredadas no se pueden cambiar aquí.</p>}
      <ul className="ux-panel-list divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{panelRows.map(row=><li key={row.label}><button type="button" aria-pressed={selectedPanel===row.label} onClick={()=>setSelectedPanel(row.label)} className={`ux-panel-button ${selectedPanel===row.label?'ux-panel-selected':''} ${FOCUS}`}><span className="flex items-center justify-between gap-2"><strong>{row.label}</strong><span className="text-xs">{row.allowed?'Habilitado':'No habilitado'}</span></span><span className="mt-1 block text-xs text-[var(--color-text-secondary)]">{row.description}</span><span className="mt-1 block text-xs text-[var(--color-text-secondary)]">Origen: {row.origin}</span></button></li>)}</ul>
    </section>
    <section aria-label={`Permisos de ${selectedPanel}`} className="ux-tree"><header className="ux-column-heading"><div><h2 className="font-condensed text-base font-semibold">{selectedPanel}</h2><p className="text-xs text-[var(--color-text-secondary)]">Revisa las acciones de este panel.</p></div></header><div className="ux-tree-scroll">
      {selectedDefinition?<div className="border-y border-[var(--color-border)]">{selectedDefinition.groups.map(group=><details key={group.label} className="ux-tree-group"><summary className={`min-h-8 cursor-pointer py-2 text-[13px] font-semibold ${FOCUS}`}>{group.label}</summary><ul className="ux-tree-items">{group.items.map(([actionId,label])=>{const assigned=Boolean(sourceFor(actionId));const sourceId=sourceFor(actionId);const fromPackage=assigned&&sourceId!=='manual'&&sourceId!=='library';const checked=inherited||assigned;const libraryItem=selectedPanel==='Biblioteca';const disabled=inherited||fromPackage||(!libraryItem&&sourceId==='library');return <li key={actionId} className="ux-tree-item"><label className={`flex min-h-8 items-center gap-2 text-[13px] ${disabled?'text-[var(--color-text-secondary)]':''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>libraryItem?setLibrarySelection(actionId,event.target.checked):setGrant(actionId,event.target.checked)} aria-describedby={`${actionId.replaceAll(':','-')}-source`} />{label}</label><span id={`${actionId.replaceAll(':','-')}-source`} className="block pl-6 text-xs text-[var(--color-text-secondary)]">{inherited?'Heredado por rol Super Admin':fromPackage?'Incluido por paquete':sourceId==='library'?'Selección de Biblioteca':assigned?'Asignación manual de demostración':'Sin asignación'}</span></li>})}</ul></details>)}</div>:<p className="text-sm text-[var(--color-text-secondary)]">Agenda: {agenda.canUseTeam?'consulta del equipo según el rol':'actividades propias según el rol'}. No requiere asignaciones individuales.</p>}
      </div>{selectedPanel==='Comercial'&&<div className="ux-package-controls border-y border-[var(--color-border)] py-2"><strong className="text-sm">Paquete Vendedor</strong><p className="text-xs text-[var(--color-text-secondary)]">Acceso al panel Comercial mediante el paquete.</p><div className="flex min-h-11 items-center justify-between gap-2 text-sm"><span>{working.packages.find(pkg=>pkg.id==='vendedor')?.applied?'Paquete activo':'Paquete sin asignar'}</span><button type="button" onClick={()=>togglePackage('vendedor',!working.packages.find(pkg=>pkg.id==='vendedor')?.applied)} disabled={inherited} className={`min-h-11 rounded border border-[var(--color-border)] px-3 ${FOCUS}`} aria-label={working.packages.find(pkg=>pkg.id==='vendedor')?.applied?'Quitar paquete Vendedor':'Activar paquete Vendedor'}>{working.packages.find(pkg=>pkg.id==='vendedor')?.applied?'Quitar paquete':'Activar paquete'}</button></div></div>}
      {selectedPanel==='Marketing'&&<div className="ux-package-controls border-y border-[var(--color-border)] py-2"><strong className="text-sm">Paquetes de Marketing</strong>{working.packages.filter(pkg=>pkg.id.startsWith('marketing-')).map(pkg=><div key={pkg.id} className="flex min-h-11 items-center justify-between gap-2 text-sm"><span>{pkg.name} · {pkg.applied?'Activo':'Sin asignar'}</span><button type="button" onClick={()=>togglePackage(pkg.id,!pkg.applied)} disabled={inherited} className={`min-h-11 rounded border border-[var(--color-border)] px-3 ${FOCUS}`}>{pkg.applied?'Quitar paquete':'Activar paquete'}</button></div>)}</div>}<footer className="ux-tree-footer"><div className="flex flex-wrap gap-2"><button type="button" onClick={onSave} disabled={!dirty||inherited} className={`min-h-11 rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-text-inverse)] disabled:opacity-50 ${FOCUS}`}>Guardar cambios</button><button type="button" onClick={onDiscard} disabled={!dirty} className={`min-h-11 rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50 ${FOCUS}`}>Descartar</button></div><p role="status" className="mt-1 text-xs text-[var(--color-text-secondary)]">{status||'Cambios de demostración solamente; no se envían a usuarios reales.'}</p></footer>
    </section>
  </div>
}
function Study() {
  const params=new URLSearchParams(location.search)
  const webContext=params.get('context')==='web'
  const [scenarioId,setScenarioId]=useState(params.get('scenario')??'super')
  const [view,setView]=useState(webContext?'proposal':params.get('view')??'actual')
  const [saved,setSaved]=useState(()=>readSaved())
  const [drafts,setDrafts]=useState(()=>Object.fromEntries(Object.entries(readSaved()).map(([id,value])=>[id,structuredClone(value)])))
  const [draft,setDraft]=useState(null)
  const [status,setStatus]=useState('')
  const scenario=scenarios.find(item=>item.id===scenarioId)??scenarios[0]
  const client=useMemo(()=>{
    state=structuredClone(saved[scenario.id]??makeState(scenario.id))
    people=[{id:'demo-user',name:scenario.name,email:'demostracion@example.invalid',isActive:true,createdAt:'2026-11-09',updatedAt:'2026-11-09',roles:[{id:'demo-role',name:scenario.role}]}]
    const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnWindowFocus:false}}})
    queryClient.setQueryData(userAccessKey('demo-user'),structuredClone(state))
    queryClient.setQueryData(['users','access-directory',''],{pages:[{data:people,meta:{total:1,skip:0,take:50}}],pageParams:[0]})
    queryClient.setQueryData(['users','access-identity','demo-user'],people[0])
    return queryClient
  },[scenario,saved])
  const selectScenario=(id)=>{if(id===scenarioId)return;if(draft&&!window.confirm('Hay cambios sin guardar. ¿Descartarlos para cambiar de usuario?'))return;if(draft)setDrafts(all=>({...all,[scenarioId]:structuredClone(saved[scenarioId]??makeState(scenarioId))}));setDraft(null);setStatus('');setScenarioId(id)}
  const saveChanges=()=>{if(!draft)return;const committed=structuredClone(draft);committed.accessVersion=(state.accessVersion??1)+1;state=committed;const next={...saved,[scenario.id]:committed};setSaved(next);persistSaved(next);setDraft(null);setStatus('Cambios guardados en esta sesión de demostración.');client.setQueryData(userAccessKey('demo-user'),structuredClone(committed))}
  const discardChanges=()=>{setDraft(null);setDrafts(all=>({...all,[scenario.id]:structuredClone(saved[scenario.id]??makeState(scenario.id))}));setStatus('Cambios descartados.');}
  const workingDraft=draft??drafts[scenario.id]??(saved[scenario.id]?structuredClone(saved[scenario.id]):structuredClone(state))
  const updateDraft=(updater)=>{setDraft(current=>{const next=updater(current??workingDraft);setDrafts(all=>({...all,[scenario.id]:next}));return next})}
  const dirty=Boolean(draft)&&JSON.stringify(draft)!==JSON.stringify(saved[scenario.id]??makeState(scenario.id))
  if (params.get('implementation') === 'real') return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/users/access?usuario=demo-user']}><Routes><Route element={<AdminLayout/>}><Route path="/users/access" element={<UserAccessAssignments/>}/></Route></Routes></MemoryRouter></QueryClientProvider>
  return <QueryClientProvider client={client}><style>{`
    .ux-study {height:100dvh;display:flex;flex-direction:column;overflow:hidden}.ux-study-web-header {flex:none}.ux-study-web-main {display:flex;flex-direction:column}.ux-study-web-main .ux-proposal-layout {height:auto;flex:1}.ux-study-web-main>h1,.ux-study-web-main>.ux-study-label {flex:none}.ux-toolbar {flex:none}.ux-toolbar-inner {gap:8px;padding:6px 16px}.ux-study-main {width:100%;max-width:none;flex:1;min-height:0;overflow:hidden;padding:8px 16px}
    .ux-proposal-layout {height:100%;min-height:0;display:grid;grid-template-columns:minmax(190px,220px) minmax(230px,280px) minmax(0,1fr);gap:10px;overflow:hidden}.ux-mobile-user {display:none}
    .ux-directory,.ux-panels,.ux-tree {min-height:0;overflow:hidden;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-card)}
    .ux-search-label {display:block;margin-top:8px;font-size:13px}
    .ux-search {display:block;width:100%;min-height:36px;margin-top:3px;padding:5px 8px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-bg-card);font-size:13px}
    .ux-user-list {margin-top:8px;display:grid;gap:2px;max-height:calc(100% - 110px);overflow:auto;overscroll-behavior:contain;scrollbar-width:none}.ux-user-list::-webkit-scrollbar,.ux-panel-list::-webkit-scrollbar,.ux-tree-items::-webkit-scrollbar {display:none}
    .ux-user {min-height:30px;padding:4px 6px;text-align:left;border-radius:4px;font-size:13px}
    .ux-user strong,.ux-user span {display:block}.ux-user span {color:var(--color-text-secondary);font-size:12px;margin-top:1px}
    .ux-user:hover {background:var(--color-bg-hover)}
    .ux-user-selected {background:var(--color-primary-bg-subtle);color:var(--color-primary)}
    .ux-column-heading {flex:none;padding:2px 2px 8px}.ux-role-note {margin-top:6px}.ux-panel-list {margin-top:8px;max-height:calc(100% - 80px);overflow:auto;overscroll-behavior:contain;scrollbar-width:none}.ux-panel-button {display:block;width:100%;min-height:0;padding:7px 8px;text-align:left;font-size:13px}.ux-panel-button:hover,.ux-panel-selected {background:var(--color-primary-bg-subtle)}.ux-tree {display:flex;flex-direction:column}.ux-tree-scroll {flex:1;min-height:0;overflow:hidden;overscroll-behavior:contain;display:flex;flex-direction:column}.ux-tree-scroll>div {flex:1;min-height:0;display:flex;flex-direction:column}.ux-tree-group {flex:0 1 auto;min-height:36px;display:flex;flex-direction:column;border-bottom:1px solid var(--color-border)}.ux-tree-group:not([open]) {flex:0 0 auto}.ux-tree-group summary {flex:none}.ux-tree-group[open]::details-content {display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden}.ux-tree-items {flex:1;min-height:0;max-height:100%;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;padding:0 0 4px 12px}.ux-tree-item {padding:1px 0}.ux-tree input[type=checkbox] {width:18px;height:18px;accent-color:var(--color-primary)}.ux-tree-footer {flex:none;padding-top:8px;background:var(--color-bg-card)}
    @media(max-width:800px) {.ux-proposal-layout {grid-template-columns:minmax(150px,190px) minmax(0,1fr);gap:8px}.ux-tree {grid-column:2}.ux-panels {grid-column:2;grid-row:1}.ux-directory {grid-column:1;grid-row:1 / span 2}}
    @media(max-width:700px) {.ux-study-main {padding:6px 8px}.ux-proposal-layout {grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr);gap:6px}.ux-directory {display:none}.ux-mobile-user {display:block;min-height:0;font-size:12px}.ux-mobile-user .ux-search {min-height:36px;margin-top:2px}.ux-panels {grid-column:1;grid-row:2;display:flex;align-items:center;gap:6px;padding:5px;overflow-x:auto;overflow-y:hidden}.ux-panels .ux-column-heading,.ux-panels .ux-role-note {display:none}.ux-panel-list {display:flex;max-height:none;overflow:visible;border:0;margin:0;white-space:nowrap}.ux-panel-list li {border:0}.ux-panel-button {padding:6px 9px}.ux-panel-button>span:nth-child(n+2) {display:none}.ux-tree {grid-column:1;grid-row:3}.ux-tree-items {max-height:clamp(100px,28dvh,260px)}.ux-tree-item label,.ux-tree-group summary {min-height:44px}.ux-tree-footer button {min-height:44px}}
  `}</style><div className={view==='proposal'?`ux-study ${webContext?'ux-study-web':''}`:''}>{webContext?<div className="ux-study-web-header"><MemoryRouter initialEntries={['/users/access']}><Header/></MemoryRouter></div>:<div className={`border-b border-[var(--color-border)] bg-[var(--color-bg-card)] ${view==='proposal'?'ux-toolbar':''}`}><div className={`mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3 ${view==='proposal'?'ux-toolbar-inner':''}`}><strong className="text-sm">Estudio UX · datos ficticios</strong><label className="text-sm">Caso de revisión <select className={`ml-2 min-h-11 max-w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 text-sm ${FOCUS}`} value={scenarioId} onChange={event=>selectScenario(event.target.value)}>{scenarios.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="flex gap-1"><button aria-pressed={view==='actual'} onClick={()=>setView('actual')} className={`min-h-11 rounded px-3 text-sm ${view==='actual'?'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]':''} ${FOCUS}`}>Vista actual</button><button aria-pressed={view==='proposal'} onClick={()=>setView('proposal')} className={`min-h-11 rounded px-3 text-sm ${view==='proposal'?'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]':''} ${FOCUS}`}>Propuesta: qué puede hacer</button></div><span className="text-xs text-[var(--color-text-secondary)]">Sin cambios en usuarios reales.</span></div></div>}<main className={`mx-auto max-w-[1600px] px-5 py-6 ${view==='proposal'?'ux-study-main':''} ${webContext?'ux-study-web-main':''}`}>{webContext&&<div className="ux-study-label mx-auto mb-1 max-w-[1600px] px-2 text-xs text-[var(--color-text-secondary)]">Vista previa · usuarios ficticios</div>}{view==='proposal'?<><h1 className="mx-auto mb-1 max-w-[1600px] px-2 font-condensed text-base font-semibold">Accesos de usuarios</h1><ProposedSummary key={scenario.id} scenario={scenario} onSelect={selectScenario} draft={workingDraft} setDraft={updateDraft} onSave={saveChanges} onDiscard={discardChanges} dirty={dirty} status={status}/></>:<MemoryRouter key={scenarioId} initialEntries={['/users/access?usuario=demo-user']}><UserAccessAssignments/></MemoryRouter>}</main></div></QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Study/> )

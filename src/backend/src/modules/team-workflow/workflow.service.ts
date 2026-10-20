import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { resolveAccess } from '../../common/security/data-scope';
import type { AccessIdentity, ScopedGrant } from '../../common/security/data-scope';
import { ActivityDto, AssignDto, ConvertDto, LinkDto, RequestDto, ReviewDto } from './workflow.dto';
type Context = {userId:string;roles:string[];jti?:string};
type AccessState = { identity: AccessIdentity; grants: ScopedGrant[]; teamOwnerIds: string[] };
const people = {id:true,name:true};

/** Acción de catálogo con la que se decide si el detalle de un recurso
 *  enlazado se REVELA al leer la actividad (contrato §6.3). Sólo acciones que
 *  YA existen o que este incremento añade con su spec:
 *  - PRODUCT / LISTA / PRICE_LIST → `products:read` y `listas:read`
 *    (`listas:read` la añade este incremento, access-catalog.spec);
 *  - IMPORT_SESSION → `listas:import` (acción existente; el modelo
 *    `ImportSession` no tiene lista asociada, así que se evalúa sin recurso).
 *  Ninguna de estas acciones se concede por crear el enlace: ver `addLink`. */
export const LINK_ACTIONS: Readonly<Record<string,string>> = Object.freeze({
  PRODUCT: 'products:read',
  LISTA: 'listas:read',
  PRICE_LIST: 'listas:read',
  IMPORT_SESSION: 'listas:import',
});

/** Clave de deduplicación de la conversión: `producto+regla+revisión`
 *  (DISENO-CATALOGO:90). Opcional vacío → cadena vacía. */
export const conversionKey = (productId:string,ruleKey?:string,revisionKey?:string):string =>
  `${productId}|${ruleKey ?? ''}|${revisionKey ?? ''}`;

/** Violación de índice única de Prisma (P2002): se comprueba por código para
 *  que valga igual con el cliente real y con fixtures de test. */
const isUniqueViolation = (error:unknown):boolean =>
  typeof error === 'object' && error !== null && (error as {code?:string}).code === 'P2002';

@Injectable()
export class WorkflowService {
 constructor(private prisma:PrismaService,private hierarchy:HierarchyService,private grants:AccessAssignmentsService) {}
 private admin(ctx:Context) { return ctx.roles.includes('Super Admin'); }
 /** Identidad para `resolveAccess`. `verified`/`active`/`sessionValid` no son
  *  una autoafirmación: la cadena de guard ya los atestiguó EN ESTA petición
  *  — `JwtStrategy.validate` comprueba usuario activo (jwt.strategy.ts:59) y
  *  sesión viva propia (jwt.strategy.ts:65) y devuelve 401 si fallan, por lo
  *  que este método sólo se ejecuta con identidad válida. `superAdmin` sale de
  *  los roles del JWT, el mismo criterio que ya usa `admin()` aquí abajo. */
 private async accessState(ctx:Context):Promise<AccessState> {
  const teamOwnerIds=this.admin(ctx)?[]:[...new Set([ctx.userId,...await this.hierarchy.getSubordinateIds(ctx.userId,{includeSelf:true})])];
  const grants=await this.grants.grantsForUser(ctx.userId);
  return {
   identity:{userId:ctx.userId,...(ctx.jti?{jti:ctx.jti}:{}),verified:true,active:true,sessionValid:true,sessionUserId:ctx.userId,superAdmin:this.admin(ctx),teamOwnerIds},
   grants,
   teamOwnerIds,
  };
 }
 private decision(state:AccessState,actionId:string,ownerId?:string) {
  return resolveAccess({identity:state.identity,actionId,grants:state.grants,...(ownerId?{resource:{id:ownerId,ownerId}}:{})});
 }
 private async requireAction(ctx:Context,actionId:string,ownerId?:string,state?:AccessState):Promise<AccessState> {
  const current=state??await this.accessState(ctx);
  if(!this.decision(current,actionId,ownerId).allowed) throw new ForbiddenException(`Sin permiso ${actionId} sobre el alcance solicitado`);
  return current;
 }
 private async requireTeamMember(ctx:Context,ownerId:string,state:AccessState,hideExistence=false) {
  if(!this.admin(ctx)&&!state.teamOwnerIds.includes(ownerId)) {
   if(hideExistence) throw new NotFoundException('Actividad no encontrada');
   throw new ForbiddenException('Solo puedes trabajar con actividades propias o de tu equipo');
  }
 }
 private async visibleOwnerIds(ctx:Context,state:AccessState,actionId:string):Promise<string[]|undefined> {
  if(this.admin(ctx)) return undefined;
  const candidates=state.teamOwnerIds;
  return candidates.filter(ownerId=>this.decision(state,actionId,ownerId).allowed);
 }
 async sellers(ctx:Context) {
  const state=await this.accessState(ctx);
  // El directorio solo existe para asignar a equipo; un grant de lectura propia
  // no revela nombres de subordinados ni convierte el selector en un bypass.
  await this.requireAction(ctx,'activities:assign',undefined,state);
  const ids=await this.visibleOwnerIds(ctx,state,'activities:assign');
  return this.prisma.user.findMany({where:{isActive:true,id:ids?{in:ids}:undefined,roles:{some:{role:{name:'Vendedor'}}}},select:people,orderBy:{name:'asc'}});
 }
 async activities(ctx:Context) {
  const state=await this.requireAction(ctx,'activities:read');
  const ids=await this.visibleOwnerIds(ctx,state,'activities:read');
  if(ids && ids.length===0) return [];
  const rows=await this.prisma.teamActivity.findMany({where:{assigneeId:ids?{in:ids}:undefined},include:{assignee:{select:people},creator:{select:people},updatedBy:{select:people},events:{orderBy:{at:'asc'}},links:{orderBy:{createdAt:'asc'}}},orderBy:{startsAt:'asc'},take:1000});
  return this.revealLinks(rows,state);
 }
 async createActivity(ctx:Context,dto:ActivityDto) {
  const state=await this.accessState(ctx);
  await this.requireTeamMember(ctx,dto.assigneeId,state);
  await this.requireAction(ctx,dto.assigneeId===ctx.userId?'activities:create':'activities:assign',dto.assigneeId,state);
  return this.prisma.teamActivity.create({data:{...dto,startsAt:new Date(dto.startsAt),creatorId:ctx.userId,events:{create:{actorId:ctx.userId,type:'CREATE'}}}});
 }
 async complete(ctx:Context,id:string) {
  const activity=await this.prisma.teamActivity.findUnique({where:{id}});
  if(!activity) throw new NotFoundException('Actividad no encontrada');
  // Re-check current team membership, including after a reassignment. El
  // conjunto es el del ACTOR: recibir una asignación no concede completar ajenas.
  const state=await this.accessState(ctx);
  await this.requireTeamMember(ctx,activity.assigneeId,state,true);
  await this.requireAction(ctx,'activities:complete',activity.assigneeId,state);
  const result=await this.prisma.$transaction(async tx=>{
   const updated=await tx.teamActivity.updateMany({where:{id,status:'PENDING'},data:{status:'COMPLETED',completedAt:new Date(),updatedById:ctx.userId}});
   if(updated.count) await tx.teamActivityEvent.create({data:{activityId:id,actorId:ctx.userId,type:'COMPLETE'}});
   return updated;
  });
  if(!result.count) throw new ConflictException('La actividad ya fue completada');
  return {ok:true};
 }
 /** Reasignar (caso 6.2): la actividad debe estar en el conjunto del actor
  *  (404 si no, para no revelar existencia ajena — 6.1) y el NUEVO asignado
  *  también (403 — «fuera del equipo se rechaza»). Asignar no concede
  *  completar ajenas: `complete` sigue midiendo el conjunto del actor. */
 async assign(ctx:Context,id:string,dto:AssignDto) {
  const activity=await this.prisma.teamActivity.findUnique({where:{id}});
  if(!activity) throw new NotFoundException('Actividad no encontrada');
  const state=await this.accessState(ctx);
  await this.requireTeamMember(ctx,activity.assigneeId,state,true);
  await this.requireTeamMember(ctx,dto.assigneeId,state);
  await this.requireAction(ctx,'activities:assign',activity.assigneeId,state);
  await this.requireAction(ctx,'activities:assign',dto.assigneeId,state);
  const result=await this.prisma.$transaction(async tx=>{
   const updated= await tx.teamActivity.updateMany({where:{id},data:{assigneeId:dto.assigneeId,updatedById:ctx.userId}});
   if(updated.count) await tx.teamActivityEvent.create({data:{activityId:id,actorId:ctx.userId,type:'ASSIGN'}});
   return updated;
  });
  if(!result.count) throw new NotFoundException('Actividad no encontrada');
  return {ok:true};
 }
 // ── BASE-03 backend-vinculos · A: enlaces con revocación de detalle ──────
 /** Snapshot del nombre del recurso en el ALTA, sólo para trazabilidad.
  *  No es un chequeo de acceso: la fila se guarda aunque el recurso no exista
  *  y el label jamás se devuelve sin `revealed:true`. */
 private async snapshotLabel(dto:LinkDto):Promise<string|null> {
  if(dto.targetType==='PRODUCT') return (await this.prisma.product.findUnique({where:{id:dto.targetId},select:{name:true}}))?.name ?? null;
  if(dto.targetType==='LISTA') return (await this.prisma.lista.findUnique({where:{id:dto.targetId},select:{name:true}}))?.name ?? null;
  if(dto.targetType==='PRICE_LIST') return (await this.prisma.priceList.findUnique({where:{id:dto.targetId},select:{name:true}}))?.name ?? null;
  return null;
 }
 /** Añade un enlace actividad → recurso.
  *
  *  REGLA DURA (ficha BASE-03 §1 regla 3): «Tarea/enlace no concede acceso al
  *  recurso». Este método SÓLO guarda la referencia: comprueba el permiso de
  *  modificación de agenda, pero no escribe AccessGrant/AccessSource/UserPermission
  *  ni modifica ninguna decisión de `resolveAccess` (spec: «crear un enlace NO
  *  escribe ninguna concesión» y «tener un enlace NO cambia ninguna decisión
  *  de resolveAccess»). La respuesta tampoco revela nada del recurso. */
 async addLink(ctx:Context,activityId:string,dto:LinkDto) {
  const activity=await this.prisma.teamActivity.findUnique({where:{id:activityId}});
  if(!activity) throw new NotFoundException('Actividad no encontrada');
  const state=await this.accessState(ctx);
  await this.requireTeamMember(ctx,activity.assigneeId,state,true);
  await this.requireAction(ctx,activity.assigneeId===ctx.userId?'activities:create':'activities:assign',activity.assigneeId,state);
  const label=await this.snapshotLabel(dto);
  try {
   const link=await this.prisma.teamActivityLink.create({data:{activityId,targetType:dto.targetType,targetId:dto.targetId,label}});
   return {id:link.id,activityId:link.activityId,targetType:link.targetType,targetId:link.targetId,revealed:false};
  } catch(error) {
   if(isUniqueViolation(error)) throw new ConflictException('Ese recurso ya está enlazado a esta actividad');
   throw error;
  }
 }
 /** Quita el vínculo (no la actividad): la trazabilidad de la tarea no se
  *  borra, sólo desaparece la referencia al recurso. */
 async removeLink(ctx:Context,activityId:string,linkId:string) {
  const activity=await this.prisma.teamActivity.findUnique({where:{id:activityId}});
  if(!activity) throw new NotFoundException('Actividad no encontrada');
  const state=await this.accessState(ctx);
  await this.requireTeamMember(ctx,activity.assigneeId,state,true);
  await this.requireAction(ctx,activity.assigneeId===ctx.userId?'activities:create':'activities:assign',activity.assigneeId,state);
  const removed=await this.prisma.teamActivityLink.deleteMany({where:{id:linkId,activityId}});
  if(!removed.count) throw new NotFoundException('Enlace no encontrado');
  return {ok:true};
 }
 /** Carga los recursos enlazados en lote (máx. 3 consultas por lectura). */
 private async loadTargets(links:any[]):Promise<Map<string,any>> {
  const idsOf=(type:string)=>[...new Set(links.filter(link=>link.targetType===type).map(link=>link.targetId))];
  const productIds=idsOf('PRODUCT'),listaIds=idsOf('LISTA'),listIds=idsOf('PRICE_LIST'),importIds=idsOf('IMPORT_SESSION');
  const [products,listaRows,lists,imports]=await Promise.all([
   productIds.length?this.prisma.product.findMany({where:{id:{in:productIds}},select:{id:true,name:true,sku:true,listaId:true,publishStatus:true}}):Promise.resolve([]),
   listaIds.length?this.prisma.lista.findMany({where:{id:{in:listaIds}},select:{id:true,name:true,code:true,isActive:true,currency:true}}):Promise.resolve([]),
   listIds.length?this.prisma.priceList.findMany({where:{id:{in:listIds}},select:{id:true,name:true,code:true,isActive:true,currency:true}}):Promise.resolve([]),
   importIds.length?this.prisma.importSession.findMany({where:{id:{in:importIds}},select:{id:true,userId:true,createdAt:true}}):Promise.resolve([]),
  ]);
  const map=new Map<string,any>();
  for(const row of products) map.set(`PRODUCT:${row.id}`,row);
  for(const row of listaRows) map.set(`LISTA:${row.id}`,row);
  for(const row of lists) map.set(`PRICE_LIST:${row.id}`,row);
  for(const row of imports) map.set(`IMPORT_SESSION:${row.id}`,row);
  return map;
 }
 /** Recurso concreto que `resolveAccess` evalúa para cada tipo de enlace.
  *  PRODUCT y PRICE_LIST se ligan a su lista para que un grant de alcance
  *  `list` cubra el producto; IMPORT_SESSION no tiene lista en el modelo. */
 private resourceFor(link:any,details:any) {
  if(link.targetType==='PRODUCT') return {id:link.targetId,kind:'product' as const,productId:link.targetId,...(details?.listaId?{listId:details.listaId}:{})};
  // Lista de catálogo y lista de tarifas: ambas se evalúan como recurso de
  // alcance `list` con su propio id (una concesión sobre otra no la cubre).
  if(link.targetType==='LISTA' || link.targetType==='PRICE_LIST') return {id:link.targetId,kind:'lista' as const,listId:link.targetId};
  return {id:link.targetId};
 }
 /** Revelación por enlace (contrato §6.3): sin cobertura → sólo
  *  `targetType`/`targetId` (trazabilidad) y `revealed:false`; con cobertura →
  *  `revealed:true` + label + detalle vivo del recurso. */
 private reveal(link:any,identity:AccessIdentity,grants:ScopedGrant[],targets:Map<string,any>) {
  const details=targets.get(`${link.targetType}:${link.targetId}`) ?? null;
  const decision=resolveAccess({identity,actionId:LINK_ACTIONS[link.targetType],grants,resource:this.resourceFor(link,details)});
  if(!decision.allowed) return {id:link.id,targetType:link.targetType,targetId:link.targetId,revealed:false};
  return {id:link.id,targetType:link.targetType,targetId:link.targetId,revealed:true,label:link.label ?? null,target:details};
 }
 /** Aplica la revocación a TODOS los enlaces de la respuesta de `activities`.
  *  Una concesión retirada entre dos lecturas oculta el detalle en la
  *  siguiente: no se cachea nada en la actividad. */
 private async revealLinks(rows:any[],state:AccessState) {
  const links=rows.flatMap(row=>row.links ?? []);
  if(!links.length) return rows;
  const targets=await this.loadTargets(links);
  return rows.map(row=>({...row,links:(row.links ?? []).map((link:any)=>this.reveal(link,state.identity,state.grants,targets))}));
 }
 // ── BASE-03 backend-vinculos · B: conversión explícita de incidencias ────
 requests(ctx:Context) {
  if(!this.admin(ctx)) throw new ForbiddenException('Las peticiones de supervisores están reservadas a Super Admin');
  return this.prisma.teamRequest.findMany({where:{},include:{creator:{select:people},reviewer:{select:people}},orderBy:{createdAt:'desc'},take:1000});
 }
 createRequest(ctx:Context,dto:RequestDto) {
  if(!this.admin(ctx)) throw new ForbiddenException('Las peticiones de supervisores están reservadas a Super Admin');
  return this.prisma.teamRequest.create({data:{...dto,creatorId:ctx.userId}});
 }
 async review(ctx:Context,id:string,dto:ReviewDto) {
  if(!this.admin(ctx)) throw new ForbiddenException();
  const result=await this.prisma.teamRequest.updateMany({where:{id,status:'PENDING'},data:{...dto,reviewerId:ctx.userId,reviewedAt:new Date()}});
  if(!result.count) throw new ConflictException('Solicitud inexistente o ya resuelta');
  return {ok:true};
 }
 /** Conversión EXPLÍCITA de solicitud/incidencia en tarea (contrato §8 D6).
  *
  *  Regla del diseño (DISENO-CATALOGO:90): «convertirlos en tareas es
  *  explícito para evitar crear cientos de tareas repetidas. La clave producto
  *  + regla + revisión evita duplicados» → `dedupKey` con índice ÚNICO: dos
  *  conversiones de la misma combinación devuelven UNA actividad.
  *
  *  Estado que permite convertir: sólo `PENDING`. El diseño no lo fija y se
  *  elige el criterio más conservador — una solicitud ya aprobada/rechazada
  *  conserva SU decisión (reviewer/response) y «historial no se borra».
  *
  *  La solicitud no se borra ni cambia: sólo se le apunta
  *  `convertedActivityId`. Requiere el mismo conjunto de equipo que
  *  `createActivity` (403 si el asignado está fuera). */
 async convertRequest(ctx:Context,id:string,dto:ConvertDto) {
  if(!this.admin(ctx)) throw new ForbiddenException('Las peticiones de supervisores están reservadas a Super Admin');
  const request=await this.prisma.teamRequest.findUnique({where:{id}});
  if(!request) throw new NotFoundException('Solicitud no encontrada');
  // Idempotencia por rastro: la solicitud ya apunta a su actividad.
  if(request.convertedActivityId) {
   const existing=await this.prisma.teamActivity.findUnique({where:{id:request.convertedActivityId}});
   if(existing) return {...existing,conversionCreated:false};
  }
  if(request.status!=='PENDING') throw new ConflictException('Sólo las solicitudes pendientes pueden convertirse en tarea');
  const assigneeId=dto.assigneeId ?? ctx.userId;
  const state=await this.accessState(ctx);
  await this.requireAction(ctx,'activities:create',assigneeId,state);
  if(assigneeId!==ctx.userId) await this.requireAction(ctx,'activities:assign',assigneeId,state);
  const product=await this.prisma.product.findUnique({where:{id:dto.productId},select:{id:true,name:true}});
  if(!product) throw new NotFoundException('Producto no encontrado');
  // Idempotencia por CLAVE producto+regla+revisión (deduplicación D6).
  const dedupKey=conversionKey(dto.productId,dto.ruleKey,dto.revisionKey);
  const existing=await this.prisma.teamActivity.findUnique({where:{dedupKey}});
  if(existing) {
   await this.prisma.teamRequest.update({where:{id:request.id},data:{convertedActivityId:existing.id}});
   return {...existing,conversionCreated:false};
  }
  try {
   const activity=await this.prisma.$transaction(async tx=>{
    const created=await tx.teamActivity.create({data:{
     title:dto.title ?? request.detail.slice(0,500),
     kind:'TASK',
     startsAt:dto.startsAt ? new Date(dto.startsAt) : new Date(),
     assigneeId,
     creatorId:ctx.userId,
     dedupKey,
     links:{create:[{targetType:'PRODUCT' as const,targetId:dto.productId,label:product.name}]},
     events:{create:{actorId:ctx.userId,type:'CONVERT'}},
    }});
    await tx.teamRequest.update({where:{id:request.id},data:{convertedActivityId:created.id}});
    return created;
   });
   return {...activity,conversionCreated:true};
  } catch(error) {
   // Carrera entre dos conversiones: gana el índice único y la segunda
   // devuelve la actividad ya creada (sin duplicar evento ni fila).
   if(isUniqueViolation(error)) {
    const winner=await this.prisma.teamActivity.findUnique({where:{dedupKey}});
    if(winner) {
     await this.prisma.teamRequest.update({where:{id:request.id},data:{convertedActivityId:winner.id}});
     return {...winner,conversionCreated:false};
    }
   }
   throw error;
  }
 }
}

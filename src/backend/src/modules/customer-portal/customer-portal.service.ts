import { AssignPortalAdvisorDto, AssignPortalTierDto, PortalTierDto } from './dto/portal-tier.dto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PortalAccountState, PortalAccountType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../products/product-library';
import { AuditService } from '../audit/audit.service';
import { ApprovePortalAccountDto, RejectPortalAccountDto } from './dto/review-portal-account.dto';
import { UpsertPortalPriceListMappingDto } from './dto/upsert-price-list-mapping.dto';
import { UpdatePortalProfileDto } from './dto/portal-profile.dto';
import { DEFAULT_PRIVACY_POLICY_VERSION } from './portal-auth/portal-auth.rules';
import { PORTAL_ACCOUNT_INCLUDE, portalAccountView } from './portal-profile';
import { CITY_INVALID_MESSAGE, findMunicipality, isValidCity } from '../../common/geo/municipalities';
import { ROLE } from '../../common/rbac/roles.constants';
import { NotificationService } from '../notifications/notification.service';
import { PORTAL_ACTIONS, PortalAccountAccessService, type PortalAdminContext } from './portal-account-access.service';
import { PortalAdvisorAssignmentService } from './portal-auth/portal-advisor-assignment.service';
import { DeletePortalAccountDto } from './dto/delete-portal-account.dto';
import { verifyPortalPassword } from './portal-auth/portal-auth.hash';
import { validatePortalPassword, weakPasswordMessage } from './portal-auth/password-policy';
import { resolveCompanyTariff } from '../../common/pricing/company-tariff';
import { CreatePortalQuoteDto, PORTAL_QUOTE_MAX_PRODUCTS, PORTAL_QUOTE_MAX_QUANTITY } from './dto/create-portal-quote.dto';
import { generateCustomerCode } from '../commercial/customers/customer-code';
import { findCustomersByIdentity, normalizeDocumentId, normalizeEmail, parseNitInput } from '../commercial/customers/customer-identity';
import { assertMoneyWithinLimit, computeLineTotal, computeQuoteTotals, effectiveQuoteStatus, generateQuoteCode, withQuoteCodeRetry } from '../commercial/quotes/quote-math';

/** Open portal quotes (enviada or negociacion, not expired) one person may hold at a time. */
const PORTAL_QUOTE_MAX_OPEN = 20;
const GENERIC_LOGIN_ERROR = 'Credenciales inválidas';
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7ROU8.4uWxTPoqkbnk1k1ZfMCTPQmPu';
const PASSWORD_HASH_PREFIX = 'sha256:';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * The tariff of an account: the guard exposes the EFFECTIVE tier as `tierId` (the linked customer's own tier wins,
 * otherwise the tier set directly on the account). Without a tier the general tariff applies. Only approved accounts
 * reach this point (the guard denies pending ones), so every approved account sees prices.
 */
export function portalPricing(account: { type: PortalAccountType; tierId?: string | null; customerId?: string | null }) {
  return { type: account.type, tierId: account.tierId ?? null };
}

@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    /** Productos, tarifas y Listas (biblioteca); lo demás sigue siendo operativo. */
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
    /** Scope checks for the staff panel; absent only in narrow unit tests (then admin methods fail closed). */
    @Optional() private readonly access?: PortalAccountAccessService,
    @Optional() private readonly assignment?: PortalAdvisorAssignmentService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  private get acl(): PortalAccountAccessService {
    if (!this.access) throw new ForbiddenException('No tienes permiso para esta acción');
    return this.access;
  }

  /** In-app notice that never breaks the operation that triggered it. */
  private async notifyAdvisor(userId: string, title: string, message: string, data: Record<string, unknown>, type: 'LEAD_ASSIGNED' | 'QUOTE_STATUS_CHANGED' = 'LEAD_ASSIGNED') {
    try { await this.notifications?.create({ userId, type, title, message, data }); }
    catch { this.logger.warn('No se pudo enviar el aviso al asesor'); }
  }

  /** Contrato de tipos compartido: el cliente de biblioteca expone sus modelos con los tipos operativos. */
  private get db(): PrismaService { return this.library.client as unknown as PrismaService }

  /** La tarifa vive en la biblioteca: el escalafón y la asignación guardan solo su id y la tarifa se resuelve aparte (sin relación entre bases). */
  private async priceListsById(ids:string[]) {
    const unique=[...new Set(ids)];
    const rows=unique.length?await this.db.priceList.findMany({where:{id:{in:unique}}}):[];
    return new Map(rows.map((r)=>[r.id,r]));
  }
  /** Company tariff shown to the customer; an inactive tier or list is an error (shared resolution with staff quotes). */
  private priceMapping(type:PortalAccountType,tierId?:string|null) {
    return resolveCompanyTariff({prisma:this.prisma,db:this.db},type,tierId,true);
  }

  /** Same fields for the full list and the pending queue; city is resolved to its name and department. */
  private static readonly ACCOUNT_ADMIN_SELECT = {
    id:true,email:true,contactName:true,companyName:true,documentId:true,phone:true,type:true,state:true,
    privacyAcceptedAt:true,deletionRequestedAt:true,city:true,createdAt:true,
    advisorId:true,advisor:{select:{id:true,name:true}},
    tierId:true,tier:{select:{id:true,name:true,isActive:true}},
    customerId:true,customer:{select:{id:true,code:true,name:true,documentId:true,email:true,ownerId:true,portalTierId:true,portalTier:{select:{id:true,name:true,isActive:true}}}},
  } satisfies Prisma.PortalAccountSelect;

  private withCity<T extends {city:string|null}>(row:T) { return {...row,city:findMunicipality(row.city)}; }

  /** Accounts the person can read (portalAccounts:read, scoped). */
  async listAccounts(ctx:PortalAdminContext) {
    const where=await this.acl.readWhere(ctx);
    const rows=await this.prisma.portalAccount.findMany({where,orderBy:{createdAt:'desc'},take:1000,select:CustomerPortalService.ACCOUNT_ADMIN_SELECT});
    return rows.map((row)=>this.withCity(row));
  }
  async listTiers() {
    const tiers=await this.prisma.portalTier.findMany({orderBy:{name:'asc'}});
    const lists=await this.priceListsById(tiers.map((x)=>x.priceListId).filter((x):x is string=>!!x));
    return tiers.map((x)=>{const l=x.priceListId?lists.get(x.priceListId):undefined;return {...x,priceList:l?{id:l.id,name:l.name,isActive:l.isActive}:null};});
  }
  /** General tariff and tiers: Super Admin, or whoever was given the `portalTariffs:manage` panel action (global). */
  async requireTariffAdmin(ctx:PortalAdminContext) {
    if(await this.acl.scopeOf(PORTAL_ACTIONS.tariffs,ctx)!=='global')throw new ForbiddenException('No tienes permiso para esta acción');
  }
  /** Advisors that manage accounts need the tier list to pick one; they never see the price list behind it. */
  async listTiersFor(ctx:PortalAdminContext) {
    if(ctx.roles?.includes(ROLE.SUPER_ADMIN))return this.listTiers();
    await this.acl.requireScope(PORTAL_ACTIONS.manage,ctx);
    return this.prisma.portalTier.findMany({where:{isActive:true},orderBy:{name:'asc'},select:{id:true,name:true,description:true,isActive:true}});
  }
  async saveTier(dto:PortalTierDto,actorId:string,id?:string) {
    if(id&&!await this.prisma.portalTier.findUnique({where:{id}}))throw new NotFoundException('Escalafón no encontrado');
    const duplicate=await this.prisma.portalTier.findFirst({where:{name:{equals:dto.name,mode:'insensitive'},...(id?{id:{not:id}}:{})}});
    if(duplicate)throw new ConflictException('Ya existe un escalafón con ese nombre');
    if(dto.priceListId) {
      const list=await this.db.priceList.findUnique({where:{id:dto.priceListId}});
      if(!list?.isActive)throw new BadRequestException('Selecciona una tarifa activa');
    }
    const tier=id?await this.prisma.portalTier.update({where:{id},data:dto}):await this.prisma.portalTier.create({data:dto});
    await this.audit.log({userId:actorId,action:id?'update':'create',entity:'PortalTier',entityId:tier.id,newValues:{name:tier.name,priceListId:tier.priceListId,isActive:tier.isActive}});
    return tier;
  }
  /**
   * The tariff is set on the ACCOUNT (it does not need a linked customer). If the linked customer already has its own
   * tier, that one wins and is the one applied; the account's own tier stays stored and applies if the customer's is removed.
   */
  async assignTier(id:string,dto:AssignPortalTierDto,ctx:PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.manage,ctx,id);
    if(dto.tierId===undefined)throw new BadRequestException('Indica el escalafón o null para usar la tarifa general');
    const account=await this.prisma.portalAccount.findUnique({where:{id},select:{id:true,state:true,tierId:true,customerId:true,customer:{select:{portalTierId:true}}}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    if(account.state==='REJECTED')throw new BadRequestException('La solicitud de esta cuenta fue rechazada');
    if(dto.tierId) {
      const tier=await this.prisma.portalTier.findUnique({where:{id:dto.tierId}});
      if(!tier?.isActive)throw new BadRequestException('Selecciona un escalafón activo');
    }
    const updated=await this.prisma.portalAccount.update({where:{id},data:{tierId:dto.tierId}});
    await this.audit.log({userId:ctx.userId,action:'update',entity:'PortalAccount',entityId:id,oldValues:{tierId:account.tierId??null},newValues:{tierId:updated.tierId??null}});
    const customerTierId=account.customer?.portalTierId??null;
    return {id:account.id,customerId:account.customerId??null,tierId:updated.tierId??null,customerTierId,effectiveTierId:customerTierId??updated.tierId??null};
  }

  /**
   * One advisor per company (C3). When a person is linked to a customer: a customer without owner takes the
   * account's advisor as owner; a customer owned by somebody else wins and the account moves to that owner.
   * Returns what changed so the caller can report it.
   */
  private async applyCompanyAdvisor(account:{advisorId:string|null},customer:{id:string;ownerId:string|null},db:{customer:{update:(args:any)=>Promise<unknown>}}=this.prisma) {
    if(!customer.ownerId) {
      if(!account.advisorId)return {advisorId:null,advisorChanged:false,ownerAssigned:false};
      await db.customer.update({where:{id:customer.id},data:{ownerId:account.advisorId}});
      return {advisorId:account.advisorId,advisorChanged:false,ownerAssigned:true};
    }
    return {advisorId:customer.ownerId,advisorChanged:customer.ownerId!==account.advisorId,ownerAssigned:false};
  }

  /** Active customer the caller can reach (items 1+2): shared by linking and approving with a customer id. */
  private async assertCustomerLinkable(customerId:string,ctx:PortalAdminContext) {
    const customer=await this.prisma.customer.findUnique({where:{id:customerId},select:{id:true,isActive:true,ownerId:true}});
    if(!customer||!customer.isActive)throw new NotFoundException('Cliente no encontrado');
    await this.acl.assertCustomerLinkable(ctx,customer);
    return customer;
  }

  /** Enlaza (o desenlaza con null) la cuenta con un cliente comercial. La empresa manda sobre el asesor (C3). */
  async linkCustomer(id:string,customerId:string|null,ctx:PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.manage,ctx,id);
    const account=await this.prisma.portalAccount.findUnique({where:{id}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    if(!customerId) {
      const updated=await this.prisma.portalAccount.update({where:{id},data:{customerId:null}});
      await this.audit.log({userId:ctx.userId,action:'update',entity:'PortalAccount',entityId:id,oldValues:{customerId:account.customerId},newValues:{customerId:null}});
      return {id:updated.id,customerId:null,advisorId:updated.advisorId??null,advisorChanged:false,ownerAssigned:false,advisor:null};
    }
    const customer=await this.assertCustomerLinkable(customerId,ctx);
    const link=await this.applyCompanyAdvisor(account,customer);
    const updated=await this.prisma.portalAccount.update({where:{id},data:{customerId,advisorId:link.advisorId}});
    const advisor=link.advisorId?await this.prisma.user.findUnique({where:{id:link.advisorId},select:{id:true,name:true}}):null;
    await this.audit.log({userId:ctx.userId,action:'update',entity:'PortalAccount',entityId:id,oldValues:{customerId:account.customerId,advisorId:account.advisorId},newValues:{customerId:updated.customerId,advisorId:updated.advisorId}});
    return {id:updated.id,customerId:updated.customerId,advisorId:updated.advisorId??null,advisorChanged:link.advisorChanged,ownerAssigned:link.ownerAssigned,advisor};
  }

  /**
   * Assigns or reassigns the advisor of a web account. The advisor belongs to the company: the linked customer's
   * owner and every other web account of that customer follow. Own and team scope can only hand the account
   * to the person or one of their subordinates (own: only accounts the person already has; team: the whole team's);
   * global scope can pick any active user.
   */
  async assignAdvisor(id:string,dto:AssignPortalAdvisorDto,ctx:PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.assign,ctx,id);
    const scope=await this.acl.requireScope(PORTAL_ACTIONS.assign,ctx);
    const advisor=await this.prisma.user.findUnique({where:{id:dto.advisorId},select:{id:true,name:true,isActive:true,roles:{select:{role:{select:{name:true}}}}}});
    if(!advisor||!advisor.isActive)throw new BadRequestException('El asesor elegido no existe o está inactivo');
    // The advisor must be able to work the account: same rule as the automatic assignment (Super Admin allowed).
    const targetIsSuper=(advisor.roles??[]).some((r)=>r.role.name===ROLE.SUPER_ADMIN);
    if(!(await this.assignment?.canManage(advisor.id,targetIsSuper)))throw new BadRequestException('El asesor elegido no tiene permiso para gestionar cuentas del portal');
    const teamIds=scope!=='global'?await this.acl.teamIds(ctx):[];
    if(scope!=='global'&&!teamIds.includes(advisor.id))throw new ForbiddenException('Solo puedes asignar a ti o a alguien de tu equipo');
    const account=await this.prisma.portalAccount.findUnique({where:{id},select:{id:true,advisorId:true,customerId:true,contactName:true,companyName:true,customer:{select:{ownerId:true}}}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    // Moving a company also moves its owner and its other web accounts: with team scope that company must be unowned or in the team.
    const companyOwner=account.customer?.ownerId??null;
    if(scope!=='global'&&account.customerId&&companyOwner&&!teamIds.includes(companyOwner))throw new ForbiddenException('Esta empresa pertenece a otro equipo');
    const accountsUpdated=await this.prisma.$transaction(async(tx)=>{
      await tx.portalAccount.update({where:{id},data:{advisorId:advisor.id}});
      if(!account.customerId)return 1;
      await tx.customer.update({where:{id:account.customerId},data:{ownerId:advisor.id}});
      const others=await tx.portalAccount.updateMany({where:{customerId:account.customerId,id:{not:id}},data:{advisorId:advisor.id}});
      return 1+others.count;
    });
    await this.audit.log({userId:ctx.userId,action:'assign-advisor',entity:'PortalAccount',entityId:id,oldValues:{advisorId:account.advisorId},newValues:{advisorId:advisor.id,customerOwnerUpdated:!!account.customerId,accountsUpdated}});
    if(advisor.id!==account.advisorId&&advisor.id!==ctx.userId) {
      await this.notifyAdvisor(advisor.id,'Cuenta web asignada',`${account.contactName} (${account.companyName}) quedó a tu cargo. Revisa la cuenta y actívala.`,{portalAccountId:id});
    }
    return {id,advisorId:advisor.id,advisor:{id:advisor.id,name:advisor.name},customerOwnerUpdated:!!account.customerId,accountsUpdated};
  }

  /**
   * Advisors the person may pick when assigning (portalAccounts:assign): own and team scope = themselves and their
   * team, global scope = everyone. Only active staff who can manage portal accounts are listed.
   */
  async listAdvisors(ctx:PortalAdminContext) {
    const scope=await this.acl.requireScope(PORTAL_ACTIONS.assign,ctx);
    const ids=scope==='global'?null:await this.acl.teamIds(ctx);
    const users=await this.prisma.user.findMany({
      where:{isActive:true,...(ids?{id:{in:ids}}:{})},
      orderBy:{name:'asc'},take:500,
      select:{id:true,name:true,zone:{select:{name:true}},roles:{select:{role:{select:{name:true}}}}},
    });
    const advisors:{id:string;name:string;zone:string|null}[]=[];
    for(const user of users) {
      const superAdmin=(user.roles??[]).some((r)=>r.role.name===ROLE.SUPER_ADMIN);
      if(await this.assignment?.canManage(user.id,superAdmin))advisors.push({id:user.id,name:user.name,zone:user.zone?.name??null});
    }
    return advisors;
  }

  private static readonly PRIVACY_REQUIRED = {code:'PRIVACY_NOT_ACCEPTED',message:'Debes aceptar la política de tratamiento de datos'};

  /** Customer completes their own profile. Never touches type, tier or state. */
  async updateProfile(accountId:string,dto:UpdatePortalProfileDto) {
    const account=await this.prisma.portalAccount.findUnique({where:{id:accountId},select:{id:true,privacyAcceptedAt:true}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    const acceptsNow=dto.acceptPrivacy===true;
    if(!account.privacyAcceptedAt&&!acceptsNow)throw new BadRequestException(CustomerPortalService.PRIVACY_REQUIRED);
    const data:Prisma.PortalAccountUpdateInput={companyName:dto.companyName.trim()};
    if(dto.documentId!==undefined)data.documentId=dto.documentId.trim()||null;
    if(dto.phone!==undefined)data.phone=dto.phone.trim()||null;
    if(dto.city!==undefined) {
      if(!isValidCity(dto.city))throw new BadRequestException({code:'INVALID_CITY',message:CITY_INVALID_MESSAGE});
      data.city=dto.city;
    }
    if(!account.privacyAcceptedAt&&acceptsNow){
      data.privacyAcceptedAt=new Date();
      data.privacyVersion=this.config.get<string>('PRIVACY_POLICY_VERSION')||DEFAULT_PRIVACY_POLICY_VERSION;
    }
    const saved=await this.prisma.portalAccount.update({where:{id:accountId},data,include:PORTAL_ACCOUNT_INCLUDE});
    // The person just gave a city: look for an advisor in that zone (no-op when the account already has one).
    if(dto.city!==undefined&&!saved.advisorId)await this.assignment?.assignForAccount(accountId);
    return {account:portalAccountView({...saved,tier:saved.customer?.portalTier??saved.tier??null})};
  }

  /** Records the request only; staff decides and nothing is deleted here. Idempotent. */
  async requestDeletion(accountId:string) {
    const account=await this.prisma.portalAccount.findUnique({where:{id:accountId},select:{id:true,deletionRequestedAt:true}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    if(account.deletionRequestedAt)return {deletionRequestedAt:account.deletionRequestedAt};
    const now=new Date();
    await this.prisma.portalAccount.update({where:{id:accountId},data:{deletionRequestedAt:now}});
    await this.audit.log({action:'deletion-request',entity:'PortalAccount',entityId:accountId,newValues:{deletionRequestedAt:now}});
    return {deletionRequestedAt:now};
  }

  /** True when the Better Auth user has a credential (email+password) login. Legacy accounts without authUserId: false. */
  async hasPassword(authUserId?:string|null):Promise<boolean> {
    if(!authUserId)return false;
    const credential=await this.prisma.portalAuthAccount.findFirst({where:{userId:authUserId,providerId:'credential',password:{not:null}},select:{id:true}});
    return !!credential;
  }

  private static readonly PASSWORD_ALREADY_SET = {code:'PASSWORD_ALREADY_SET',message:'Tu cuenta ya tiene contraseña. Puedes cambiarla en Mis datos.'};

  /**
   * Google-only accounts create their first password here. `create` is the Better Auth server-side setPassword
   * call, injected so this stays unit-testable. Acts only on the session owner. Audit carries no personal data.
   */
  async createOwnPassword(owner:{id:string;email:string;contactName?:string|null;authUserId?:string|null;hasPassword?:boolean},newPassword:string,create:(password:string)=>Promise<void>) {
    if(!owner.authUserId)throw new BadRequestException({code:'PASSWORD_NOT_AVAILABLE',message:'Esta cuenta no puede crear contraseña aquí'});
    if(owner.hasPassword===true)throw new BadRequestException(CustomerPortalService.PASSWORD_ALREADY_SET);
    const failed=validatePortalPassword(newPassword,{email:owner.email,name:owner.contactName});
    if(failed.length)throw new BadRequestException({code:'WEAK_PASSWORD',message:weakPasswordMessage(failed)});
    await create(newPassword);
    await this.audit.log({action:'set-password',entity:'PortalAccount',entityId:owner.id});
    return {hasPassword:true};
  }

  /** Deletes ONLY the portal account (and its auth login); customers, quotes and orders stay. Audit carries no personal data. */
  async deleteOwnAccount(owner:{id:string;email:string;authUserId?:string|null;hasPassword?:boolean},dto:DeletePortalAccountDto) {
    // The guard already knows when there is no password: skip the lookup. Otherwise the hash is needed to verify it.
    const credential=owner.authUserId&&owner.hasPassword!==false
      ? await this.prisma.portalAuthAccount.findFirst({where:{userId:owner.authUserId,providerId:'credential',password:{not:null}},select:{password:true}})
      : null;
    if(credential?.password){
      const ok=!!dto.password&&await verifyPortalPassword({hash:credential.password,password:dto.password});
      if(!ok)throw new BadRequestException({code:'DELETE_CONFIRMATION_INVALID',message:'La contraseña no es correcta'});
    }else if((dto.confirmEmail??'').trim().toLowerCase()!==owner.email.trim().toLowerCase()||!dto.confirmEmail?.trim()){
      throw new BadRequestException({code:'DELETE_CONFIRMATION_INVALID',message:'El correo escrito no coincide con el de tu cuenta'});
    }
    try{
      await this.prisma.$transaction(async(tx:any)=>{
        await tx.portalAccount.delete({where:{id:owner.id}});
        if(owner.authUserId)await tx.portalAuthUser.delete({where:{id:owner.authUserId}});
      });
    }catch(error){
      if((error as {code?:string})?.code==='P2003')throw new ConflictException({code:'DELETE_BLOCKED',message:'No pudimos borrar tu cuenta porque tiene información asociada. Contacta a tu asesor.'});
      throw error;
    }
    await this.audit.log({action:'delete',entity:'PortalAccount',entityId:owner.id});
    return {deleted:true};
  }

  async suspend(id:string,reason:string,ctx:PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.manage,ctx,id);
    const account=await this.prisma.portalAccount.findUnique({where:{id}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    if(account.state==='SUSPENDED')throw new BadRequestException('La cuenta ya está suspendida');
    if(account.state!=='ACTIVE')throw new BadRequestException('Solo se pueden suspender cuentas activas');
    const now=new Date();
    await this.prisma.$transaction(async (tx)=>{
      await tx.portalAccount.update({where:{id},data:{state:PortalAccountState.SUSPENDED}});
      if(account.authUserId)await tx.portalAuthSession.deleteMany({where:{userId:account.authUserId}});
      await tx.portalSession.updateMany({where:{accountId:id,revokedAt:null},data:{revokedAt:now}});
    });
    await this.audit.log({userId:ctx.userId,action:'suspend',entity:'PortalAccount',entityId:id,oldValues:{state:account.state},newValues:{state:PortalAccountState.SUSPENDED,reason:reason.trim()}});
    return {id,state:PortalAccountState.SUSPENDED};
  }

  async reactivate(id:string,ctx:PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.manage,ctx,id);
    const account=await this.prisma.portalAccount.findUnique({where:{id}});
    if(!account)throw new NotFoundException('Cuenta no encontrada');
    if(account.state!=='SUSPENDED')throw new BadRequestException('Solo se pueden reactivar cuentas suspendidas');
    await this.prisma.portalAccount.update({where:{id},data:{state:PortalAccountState.ACTIVE}});
    await this.audit.log({userId:ctx.userId,action:'reactivate',entity:'PortalAccount',entityId:id,oldValues:{state:'SUSPENDED'},newValues:{state:PortalAccountState.ACTIVE}});
    return {id,state:PortalAccountState.ACTIVE};
  }

  async login(emailInput: string, password: string, meta: { ipAddress?: string; userAgent?: string }) {
    const email = emailInput.trim().toLowerCase();
    const account = await this.prisma.portalAccount.findUnique({ where: { email } });
    const storedHash = account?.passwordHash ?? DUMMY_HASH;
    const prehashed = storedHash.startsWith(PASSWORD_HASH_PREFIX);
    const valid = await bcrypt.compare(
      prehashed ? sha256(password) : password,
      prehashed ? storedHash.slice(PASSWORD_HASH_PREFIX.length) : storedHash,
    );
    if (!account || !valid) throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    // El estado se revela SOLO con contraseña correcta (dueño de la cuenta);
    // sin contraseña el login sigue siendo un 401 genérico anti-enumeración.
    if (account.state === 'PENDING') throw new ForbiddenException('Cuenta pendiente de aprobación comercial.');
    if (account.state === 'REJECTED') throw new ForbiddenException('La solicitud de acceso fue rechazada.');
    const hours = this.config.get<number>('PORTAL_SESSION_HOURS', 8);
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    const jti = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockActiveAccount(tx, account.id);
      if (!current || current.passwordHash !== account.passwordHash) {
        throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
      }
      await tx.portalSession.create({ data: { jti, accountId: account.id, expiresAt, ...meta } });
    });
    const token = this.jwt.sign({ sub: account.id, jti, scope: 'customer_portal' }, { expiresIn: `${hours}h` });
    return { token, expiresAt, account: { id: account.id, email: account.email, type: account.type } };
  }

  async logout(jti: string) { await this.prisma.portalSession.updateMany({ where: { jti, revokedAt: null }, data: { revokedAt: new Date() } }); }

  /**
   * Precios del cliente para un lote de referencias (vitrina). Mismas reglas de publicación y vigencia que el catálogo.
   * Sin tarifa aplicable o sin precio vigente, la referencia simplemente no aparece: nunca se inventa un valor.
   */
  async getCatalogPrices(ids:string[],accountType:PortalAccountType,tierId?:string|null) {
    let mapping:Awaited<ReturnType<CustomerPortalService['priceMapping']>>=null;
    try { mapping=await this.priceMapping(accountType,tierId); }
    catch(error) { if(!(error instanceof BadRequestException))throw error; }
    if(!mapping||!ids.length)return {prices:[]};
    const visible=await this.db.product.findMany({
      where:{id:{in:ids},lifecycleStatus:'PUBLISHED',isActive:true,isVisible:true,category:{isActive:true},brand:{isActive:true}},
      select:{id:true},
    });
    if(!visible.length)return {prices:[]};
    const now=new Date();
    const rows=await this.db.price.findMany({
      where:{
        productId:{in:visible.map((p)=>p.id)},priceListId:mapping.priceListId,
        OR:[{validFrom:null},{validFrom:{lte:now}}],AND:[{OR:[{validUntil:null},{validUntil:{gte:now}}]}],
      },
      select:{productId:true,value:true,currency:true},
    });
    const seen=new Set<string>();
    const prices=rows.filter((r)=>!seen.has(r.productId)&&seen.add(r.productId)).map((r)=>({productId:r.productId,value:r.value.toString(),currency:r.currency}));
    return {prices};
  }

  /**
   * A customer sends the quote built in the store. It is a `Quote` of portal origin: owned by the company's advisor,
   * priced with the company tariff (a line without a current price enters as "precio por confirmar", never invented)
   * and sent right away ('enviada'). Prices are frozen at this moment.
   */
  async createCustomerQuote(
    account:{id:string;state:string;type:PortalAccountType;customerId?:string|null;advisorId?:string|null;tierId?:string|null;contactName:string;companyName:string},
    dto:CreatePortalQuoteDto,
  ) {
    if(account.state!=='ACTIVE')throw new ConflictException('Tu cuenta aún no está activa; tu asesor la activará pronto');
    if(!account.customerId)throw new ConflictException('Tu cuenta aún no está vinculada a una empresa; tu asesor debe vincularla antes de que puedas cotizar');
    const customer=await this.prisma.customer.findUnique({where:{id:account.customerId},select:{id:true,isActive:true,ownerId:true}});
    if(!customer||!customer.isActive)throw new ConflictException('Tu empresa no está activa; contacta a tu asesor');
    const advisorId=account.advisorId??customer.ownerId;
    const advisor=advisorId?await this.prisma.user.findUnique({where:{id:advisorId},select:{id:true,isActive:true}}):null;
    if(!advisorId||!advisor?.isActive)throw new ConflictException('Tu cuenta aún no tiene un asesor asignado; en cuanto lo tenga podrás cotizar');

    // Same product twice: sum the quantities.
    const merged=new Map<string,number>();
    for(const item of dto.items)merged.set(item.productId,(merged.get(item.productId)??0)+item.quantity);
    if(merged.size>PORTAL_QUOTE_MAX_PRODUCTS)throw new BadRequestException(`Una cotización puede tener hasta ${PORTAL_QUOTE_MAX_PRODUCTS} productos distintos`);
    if([...merged.values()].some((q)=>q>PORTAL_QUOTE_MAX_QUANTITY))throw new BadRequestException(`La cantidad máxima por producto es ${PORTAL_QUOTE_MAX_QUANTITY}`);
    const ids=[...merged.keys()];

    // Only products the customer can see in the published catalog (same boundary as the catalog).
    const products=await this.db.product.findMany({
      where:{id:{in:ids},lifecycleStatus:'PUBLISHED',isActive:true,isVisible:true,category:{isActive:true},brand:{isActive:true}},
      select:{id:true,sku:true,name:true},
    });
    if(products.length!==ids.length)throw new BadRequestException('Algunos productos ya no están disponibles en el catálogo; quítalos e intenta de nuevo');
    const byId=new Map(products.map((p)=>[p.id,p]));

    // Company tariff; an unusable tier or list means no prices (all lines "por confirmar"), never an invented value.
    let tariff:Awaited<ReturnType<CustomerPortalService['priceMapping']>>=null;
    const pricing=portalPricing(account);
    try { tariff=pricing?await this.priceMapping(pricing.type,pricing.tierId):null; }
    catch(error) { if(!(error instanceof BadRequestException))throw error; }
    const now=new Date();
    const priceRows=tariff?await this.db.price.findMany({
      where:{
        productId:{in:ids},priceListId:tariff.priceListId,
        OR:[{validFrom:null},{validFrom:{lte:now}}],AND:[{OR:[{validUntil:null},{validUntil:{gte:now}}]}],
      },
      orderBy:{updatedAt:'desc'},
      select:{id:true,productId:true,value:true,currency:true},
    }):[];
    const priceByProduct=new Map<string,(typeof priceRows)[number]>();
    for(const row of priceRows)if(!priceByProduct.has(row.productId))priceByProduct.set(row.productId,row);

    const lines=ids.map((productId,index)=>{
      const product=byId.get(productId)!;
      const price=priceByProduct.get(productId);
      const quantity=merged.get(productId)!;
      const unitPrice=price?Number(price.value):null;
      return {
        position:index+1,productId,priceId:price?.id??null,sku:product.sku,name:product.name,
        priceListId:tariff?.priceListId??null,unitPrice,currency:price?.currency??'COP',quantity,discountPct:0,
        lineTotal:computeLineTotal(unitPrice,quantity,0),priceCapturedAt:now,
      };
    });
    const totals=computeQuoteTotals(lines,0,19);
    assertMoneyWithinLimit(...lines.map((l)=>l.lineTotal),totals.subtotal,totals.taxAmount,totals.total);
    // Open quotes (sent or in negotiation, not expired) are capped per person.
    const open=await this.prisma.quote.count({where:{portalAccountId:account.id,status:{in:['enviada','negociacion']},OR:[{validUntil:null},{validUntil:{gte:now}}]}});
    if(open>=PORTAL_QUOTE_MAX_OPEN)throw new ConflictException(`Ya tienes ${PORTAL_QUOTE_MAX_OPEN} cotizaciones abiertas; espera la respuesta de tu asesor`);
    const notes=dto.notes?.trim()||null;

    const quote=await withQuoteCodeRetry(()=>this.prisma.$transaction(async(tx)=>{
      const created=await tx.quote.create({data:{
        code:await generateQuoteCode(tx),
        customerId:customer.id,ownerId:advisorId,priceListId:tariff?.priceListId??null,portalAccountId:account.id,
        status:'enviada',issuedAt:now,notes,...totals,
        items:{create:lines},
      }});
      await tx.quoteStatusEvent.create({data:{quoteId:created.id,fromStatus:null,toStatus:'enviada',portalAccountId:account.id}});
      return created;
    }));
    const pendingPrices=lines.filter((l)=>l.unitPrice===null).length;
    await this.audit.log({action:'create',entity:'Quote',entityId:quote.id,newValues:{code:quote.code,customerId:customer.id,portalAccountId:account.id,origin:'portal',items:lines.length,pendingPrices}});
    await this.notifyAdvisor(advisorId,'Nueva cotización de un cliente',`${account.contactName} (${account.companyName}) envió la cotización ${quote.code}. Revisa el stock y contáctalo.`,{quoteId:quote.id,quoteCode:quote.code,portalAccountId:account.id,newStatus:'enviada'},'QUOTE_STATUS_CHANGED');
    return {id:quote.id,code:quote.code,status:'enviada',total:Number(quote.total),currency:quote.currency,itemCount:lines.length,hasPendingPrices:pendingPrices>0};
  }

  /** The caller's own quotes only (the ones this person sent), newest first. */
  async listCustomerQuotes(accountId:string) {
    const rows=await this.prisma.quote.findMany({
      where:{portalAccountId:accountId},orderBy:{createdAt:'desc'},take:200,
      select:{id:true,code:true,status:true,validUntil:true,createdAt:true,issuedAt:true,total:true,currency:true,items:{select:{unitPrice:true}}},
    });
    return rows.map((row)=>{
      const q=effectiveQuoteStatus(row);
      return {id:q.id,code:q.code,status:q.status,createdAt:q.createdAt,issuedAt:q.issuedAt,total:Number(q.total),currency:q.currency,itemCount:q.items.length,hasPendingPrices:q.items.some((i)=>i.unitPrice===null)};
    });
  }

  /** One of the caller's own quotes with its lines and history; anything else is a 404. Staff names and ids never leave. */
  async getCustomerQuote(accountId:string,id:string) {
    const quote=await this.prisma.quote.findFirst({
      where:{id,portalAccountId:accountId},
      include:{
        items:{orderBy:{position:'asc'}},
        statusEvents:{orderBy:{createdAt:'asc'}},
        owner:{select:{name:true}},
      },
    });
    if(!quote)throw new NotFoundException('Cotización no encontrada');
    const q=effectiveQuoteStatus(quote);
    return {
      id:q.id,code:q.code,status:q.status,createdAt:q.createdAt,issuedAt:q.issuedAt,validUntil:q.validUntil,notes:q.notes,
      currency:q.currency,subtotal:Number(q.subtotal),taxRate:Number(q.taxRate),taxAmount:Number(q.taxAmount),total:Number(q.total),
      advisor:q.owner?{name:q.owner.name}:null,
      hasPendingPrices:q.items.some((i)=>i.unitPrice===null),
      items:q.items.map((i)=>({
        id:i.id,sku:i.sku,name:i.name,quantity:i.quantity,currency:i.currency,
        unitPrice:i.unitPrice===null?null:Number(i.unitPrice),lineTotal:Number(i.lineTotal),
      })),
      history:q.statusEvents.map((e)=>({
        fromStatus:e.fromStatus,toStatus:e.toStatus,createdAt:e.createdAt,
        actor:e.portalAccountId===accountId?'Tú':e.portalAccountId?'Tu empresa':'Tu asesor',
      })),
    };
  }

  /** Cola de revisión: cuentas pendientes dentro del alcance de quien consulta (portalAccounts:read). */
  async listPending(ctx:PortalAdminContext) {
    const scope=await this.acl.readWhere(ctx);
    const rows=await this.prisma.portalAccount.findMany({
      where:{AND:[{state:'PENDING'},scope]},
      orderBy:{createdAt:'asc'},
      select:CustomerPortalService.ACCOUNT_ADMIN_SELECT,
    });
    return rows.map((row)=>this.withCity(row));
  }

  async approve(id: string, dto: ApprovePortalAccountDto, ctx: PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.manage, ctx, id);
    const account = await this.prisma.portalAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Solicitud de portal no encontrada');
    if (account.state !== 'PENDING') throw new ConflictException('La cuenta ya fue revisada');
    if (!account.advisorId) throw new ConflictException('Asigna un asesor antes de activar');
    const foundMapping = await this.prisma.portalPriceListMapping.findUnique({ where: { type: account.type } });
    const mappingList = foundMapping ? (await this.priceListsById([foundMapping.priceListId])).get(foundMapping.priceListId) : undefined;
    const mapping = foundMapping && mappingList ? { ...foundMapping, priceList: mappingList } : null;
    if (!mapping || !mapping.priceList.isActive) throw new BadRequestException('Configure una tarifa activa para el tipo de cliente antes de aprobar');
    // Same reach rule as linking: only an active customer the caller can already reach (also when it was linked earlier).
    let target = dto.customerId ?? account.customerId ?? undefined;
    let found = false;
    if (!target) {
      // No customer chosen: the same company may already exist (created by an advisor). Never create a second one.
      target = await this.findExistingCustomerFor(account);
      found = !!target;
    }
    let existing: { id: string; isActive: boolean; ownerId: string | null } | null = null;
    if (target) {
      try { existing = await this.assertCustomerLinkable(target, ctx); }
      catch (error) {
        if (found && error instanceof ForbiddenException) throw new ConflictException({ code: 'CUSTOMER_OUT_OF_SCOPE', message: 'Ya existe una empresa con ese NIT o correo, pero no está a tu cargo. Pídele a su responsable o a tu supervisor que apruebe la cuenta.' });
        throw error;
      }
    }
    const code = existing ? null : await generateCustomerCode(this.prisma);
    // NIT base only; a wrong verification digit from the public sign-up is ignored, it never blocks the approval.
    const documentId = parseNitInput(account.documentId).base || null;
    // One transaction: the state flip is guarded (PENDING only) so a concurrent review leaves no orphan Customer.
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        let customerId = existing?.id;
        let advisorId = account.advisorId;
        if (existing) {
          // The company's advisor wins (C3); a customer without owner takes this account's advisor.
          advisorId = (await this.applyCompanyAdvisor(account, existing, tx)).advisorId ?? advisorId;
        } else {
          const customer = await tx.customer.create({
            data: {
              code: code!,
              name: account.companyName,
              documentType: documentId ? 'NIT' : null,
              documentId,
              email: normalizeEmail(account.email) || null,
              phone: account.phone,
              status: 'CLIENTE',
              source: 'WEB',
              convertedAt: new Date(),
              createdById: ctx.userId,
              ownerId: account.advisorId,
            },
          });
          customerId = customer.id;
        }
        const flipped = await tx.portalAccount.updateMany({ where: { id, state: 'PENDING' }, data: { state: 'ACTIVE', customerId, advisorId, approvedById: ctx.userId, approvedAt: new Date() } });
        if (!flipped.count) throw new ConflictException('La cuenta ya fue revisada');
        return { customerId, advisorId };
      });
    } catch (error) {
      // Someone created the same company between the lookup and the insert: the next try finds and links it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        const sameCompany = target.includes('documentId') || target.includes('documentType');
        throw new ConflictException(sameCompany
          ? { code: 'CUSTOMER_DUPLICATE', field: 'documentId', message: 'Mientras aprobabas se creó otro cliente con ese NIT. Intenta aprobar de nuevo para vincularla a ese cliente.' }
          : { code: 'CUSTOMER_CONFLICT', message: 'No se pudo crear el cliente porque otro registro se cruzó. Intenta aprobar de nuevo.' });
      }
      throw error;
    }
    await this.audit.log({ userId: ctx.userId, action: 'approve', entity: 'PortalAccount', entityId: id, newValues: { customerId: result.customerId, advisorId: result.advisorId, type: account.type, priceListId: mapping.priceListId } });
    return { id, state: PortalAccountState.ACTIVE, customerId: result.customerId, advisorId: result.advisorId };
  }

  /**
   * Customer that already is this web account's company, by normalized NIT and email (the same rules as the
   * internal create). Returns its id when exactly ONE active customer matches; undefined when none does.
   * 409 CUSTOMER_AMBIGUOUS (account stays pending, the advisor links by hand) when several match, the only match
   * is deactivated, or it matches by email but has a different NIT than the account.
   */
  private async findExistingCustomerFor(account: { documentId?: string | null; email?: string | null }): Promise<string | undefined> {
    const documentId = parseNitInput(account.documentId).base; // base only, so "9011234561" finds "901123456"
    const matches = await findCustomersByIdentity(this.prisma, { documentId, email: normalizeEmail(account.email) });
    if (!matches.length) return undefined;
    const ambiguous = (message: string) => new ConflictException({ code: 'CUSTOMER_AMBIGUOUS', message });
    if (matches.length > 1) throw ambiguous('Hay más de un cliente con el NIT o el correo de esta cuenta. Vincúlala a mano al cliente correcto y vuelve a aprobar.');
    const [match] = matches;
    if (!match.isActive) throw ambiguous('Ya existe un cliente desactivado con el NIT o el correo de esta cuenta. Pide a tu supervisor que lo reactive o vincúlala a mano a otro cliente.');
    const otherDocument = normalizeDocumentId(match.documentId);
    if (!match.byDocument && documentId && otherDocument && otherDocument !== documentId) {
      throw ambiguous('El correo de esta cuenta pertenece a un cliente con otro NIT. Revisa los datos y vincúlala a mano al cliente correcto.');
    }
    return match.id;
  }

  async reject(id: string, dto: RejectPortalAccountDto, ctx: PortalAdminContext) {
    await this.acl.assertAccount(PORTAL_ACTIONS.manage, ctx, id);
    const updated = await this.prisma.portalAccount.updateMany({ where: { id, state: 'PENDING' }, data: { state: 'REJECTED', rejectedById: ctx.userId, rejectedAt: new Date(), rejectionReason: dto.reason.trim() } });
    if (!updated.count) throw new ConflictException('La cuenta ya fue revisada');
    await this.audit.log({ userId: ctx.userId, action: 'reject', entity: 'PortalAccount', entityId: id, newValues: { reason: dto.reason.trim() } });
    return { id, state: PortalAccountState.REJECTED };
  }

  async listMappings() {
    const mappings = await this.prisma.portalPriceListMapping.findMany({ orderBy: { type: 'asc' } });
    const lists = await this.priceListsById(mappings.map((m) => m.priceListId));
    return mappings.map((m) => {
      const l = lists.get(m.priceListId);
      return { ...m, priceList: l ? { id: l.id, name: l.name, code: l.code, currency: l.currency, isActive: l.isActive } : null };
    });
  }

  async upsertMapping(dto: UpsertPortalPriceListMappingDto, actorId: string) {
    const list = await this.db.priceList.findUnique({ where: { id: dto.priceListId } });
    if (!list || !list.isActive) throw new BadRequestException('La tarifa debe existir y estar activa');
    const mapping = await this.prisma.portalPriceListMapping.upsert({ where: { type: dto.type }, create: dto, update: { priceListId: dto.priceListId } });
    await this.audit.log({ userId: actorId, action: 'upsert', entity: 'PortalPriceListMapping', entityId: mapping.id, newValues: { type: dto.type, priceListId: dto.priceListId } });
    return mapping;
  }

  private async lockActiveAccount(tx: Prisma.TransactionClient, accountId: string) {
    // Serializa la emisión de sesiones con el consumo y la revocación.
    const [account] = await tx.$queryRaw<{ email: string; passwordHash: string }[]>`
      SELECT "email", "passwordHash" FROM "portal_accounts"
      WHERE "id" = ${accountId} AND "state" = 'ACTIVE'
      FOR UPDATE
    `;
    return account;
  }
}

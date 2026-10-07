import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';
import { ActivityDto, RequestDto, ReviewDto } from './workflow.dto';
type Context = {userId:string;roles:string[]};
const people = {id:true,name:true};
@Injectable()
export class WorkflowService {
 constructor(private prisma:PrismaService,private hierarchy:HierarchyService) {}
 private admin(ctx:Context) { return ctx.roles.includes('Super Admin'); }
 async sellers(ctx:Context) {
  const ids = this.admin(ctx) ? undefined : ctx.roles.includes('Supervisor') ? await this.hierarchy.getSubordinateIds(ctx.userId) : [ctx.userId];
  return this.prisma.user.findMany({where:{isActive:true,id:ids ? {in:ids}:undefined,roles:{some:{role:{name:'Vendedor'}}}},select:people,orderBy:{name:'asc'}});
 }
 async activities(ctx:Context) {
  const ids=(await this.sellers(ctx)).map(p=>p.id);
  return this.prisma.teamActivity.findMany({where:{assigneeId:{in:ids}},include:{assignee:{select:people},creator:{select:people}},orderBy:{startsAt:'asc'},take:1000});
 }
 async createActivity(ctx:Context,dto:ActivityDto) {
  if (!(await this.sellers(ctx)).some(p=>p.id===dto.assigneeId)) throw new ForbiddenException('Solo puedes asignar actividades dentro de tu equipo');
  return this.prisma.teamActivity.create({data:{...dto,startsAt:new Date(dto.startsAt),creatorId:ctx.userId}});
 }
 async complete(ctx:Context,id:string) {
  const activity=await this.prisma.teamActivity.findUnique({where:{id}});
  if(!activity) throw new NotFoundException('Actividad no encontrada');
  // Re-check current team membership, including after a reassignment.
  if(!(await this.sellers(ctx)).some(p=>p.id===activity.assigneeId)) throw new ForbiddenException();
  const result=await this.prisma.teamActivity.updateMany({where:{id,status:'PENDING'},data:{status:'COMPLETED',completedAt:new Date()}});
  if(!result.count) throw new ConflictException('La actividad ya fue completada');
  return {ok:true};
 }
 requests(ctx:Context) {
  return this.prisma.teamRequest.findMany({where:this.admin(ctx)?{}:{creatorId:ctx.userId},include:{creator:{select:people},reviewer:{select:people}},orderBy:{createdAt:'desc'},take:1000});
 }
 createRequest(ctx:Context,dto:RequestDto) { return this.prisma.teamRequest.create({data:{...dto,creatorId:ctx.userId}}); }
 async review(ctx:Context,id:string,dto:ReviewDto) {
  if(!this.admin(ctx)) throw new ForbiddenException();
  const result=await this.prisma.teamRequest.updateMany({where:{id,status:'PENDING'},data:{...dto,reviewerId:ctx.userId,reviewedAt:new Date()}});
  if(!result.count) throw new ConflictException('Solicitud inexistente o ya resuelta');
  return {ok:true};
 }
}

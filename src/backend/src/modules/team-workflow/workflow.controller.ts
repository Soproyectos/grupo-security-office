import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowService } from './workflow.service';
import { ActivityDto, AssignDto, ConvertDto, LinkDto, RequestDto, ReviewDto } from './workflow.dto';
@Controller('api/team-workflow')
@UseGuards(JwtAuthGuard,RolesGuard)
export class WorkflowController {
 constructor(private service:WorkflowService) {}
 // `jti` alimenta la identidad de `resolveAccess`; los grants y alcances se
 // vuelven a consultar en el servicio en cada petición (incluida la agenda).
 private ctx(user:any) {return {userId:user.sub??user.id,roles:user.roles??[],jti:user.jti};}
 @Get('sellers') sellers(@CurrentUser() u:any) {return this.service.sellers(this.ctx(u));}
 @Get('activities') activities(@CurrentUser() u:any) {return this.service.activities(this.ctx(u));}
 @Post('activities') create(@CurrentUser() u:any,@Body() dto:ActivityDto) {return this.service.createActivity(this.ctx(u),dto);}
 @Patch('activities/:id/complete') complete(@CurrentUser() u:any,@Param('id') id:string) {return this.service.complete(this.ctx(u),id);}
 @Patch('activities/:id/assign') assign(@CurrentUser() u:any,@Param('id') id:string,@Body() dto:AssignDto) {return this.service.assign(this.ctx(u),id,dto);}
 // Enlaces actividad → recurso (BASE-03 backend-vinculos): el alta sólo guarda
 // la referencia (nunca concede acceso) y la lectura aplica la revocación de
 // §6.3 dentro de `activities()`.
 @Post('activities/:id/links') addLink(@CurrentUser() u:any,@Param('id') id:string,@Body() dto:LinkDto) {return this.service.addLink(this.ctx(u),id,dto);}
 @Delete('activities/:id/links/:linkId') removeLink(@CurrentUser() u:any,@Param('id') id:string,@Param('linkId') linkId:string) {return this.service.removeLink(this.ctx(u),id,linkId);}
 // El catálogo no tiene una acción de solicitudes. Se conserva el flujo solo
 // para administración explícita de Super Admin hasta que esa acción se defina.
 @Get('requests') @Roles('Super Admin') requests(@CurrentUser() u:any) {return this.service.requests(this.ctx(u));}
 @Post('requests') @Roles('Super Admin') request(@CurrentUser() u:any,@Body() dto:RequestDto) {return this.service.createRequest(this.ctx(u),dto);}
 @Patch('requests/:id/review') @Roles('Super Admin') review(@CurrentUser() u:any,@Param('id') id:string,@Body() dto:ReviewDto) {return this.service.review(this.ctx(u),id,dto);}
 // La conversión conserva su acción de agenda y su revisión de Super Admin;
 // no amplía las capacidades de peticiones del supervisor.
 @Post('requests/:id/convert') @Roles('Super Admin') convert(@CurrentUser() u:any,@Param('id') id:string,@Body() dto:ConvertDto) {return this.service.convertRequest(this.ctx(u),id,dto);}
}

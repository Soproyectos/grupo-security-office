import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowService } from './workflow.service';
import { ActivityDto, RequestDto, ReviewDto } from './workflow.dto';
@Controller('api/team-workflow')
@UseGuards(JwtAuthGuard,RolesGuard)
export class WorkflowController {
 constructor(private service:WorkflowService) {}
 private ctx(user:any) {return {userId:user.sub??user.id,roles:user.roles??[]};}
 @Get('sellers') @Roles('Vendedor','Supervisor','Super Admin') sellers(@CurrentUser() u:any) {return this.service.sellers(this.ctx(u));}
 @Get('activities') @Roles('Vendedor','Supervisor','Super Admin') activities(@CurrentUser() u:any) {return this.service.activities(this.ctx(u));}
 @Post('activities') @Roles('Vendedor','Supervisor','Super Admin') create(@CurrentUser() u:any,@Body() dto:ActivityDto) {return this.service.createActivity(this.ctx(u),dto);}
 @Patch('activities/:id/complete') @Roles('Vendedor','Supervisor','Super Admin') complete(@CurrentUser() u:any,@Param('id') id:string) {return this.service.complete(this.ctx(u),id);}
 @Get('requests') @Roles('Supervisor','Super Admin') requests(@CurrentUser() u:any) {return this.service.requests(this.ctx(u));}
 @Post('requests') @Roles('Supervisor') request(@CurrentUser() u:any,@Body() dto:RequestDto) {return this.service.createRequest(this.ctx(u),dto);}
 @Patch('requests/:id/review') @Roles('Super Admin') review(@CurrentUser() u:any,@Param('id') id:string,@Body() dto:ReviewDto) {return this.service.review(this.ctx(u),id,dto);}
}

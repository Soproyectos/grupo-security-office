import { WorkflowService } from './workflow.service';
describe('Workflow authorization and decisions',()=>{
 const seller={userId:'seller',roles:['Vendedor']};
 const supervisor={userId:'supervisor',roles:['Supervisor']};
 const admin={userId:'admin',roles:['Super Admin']};
 let prisma:any,service:WorkflowService,hierarchy:any;
 beforeEach(()=>{
  prisma={user:{findMany:jest.fn().mockResolvedValue([{id:'seller',name:'Seller'}])},teamActivity:{create:jest.fn(),findUnique:jest.fn(),updateMany:jest.fn()},teamRequest:{findMany:jest.fn(),create:jest.fn(),updateMany:jest.fn().mockResolvedValue({count:1})}};
  hierarchy={getSubordinateIds:jest.fn().mockResolvedValue(['seller'])};
  service=new WorkflowService(prisma,hierarchy);
 });
 it('restricts seller discovery to self and active seller role',async()=>{
  await service.sellers(seller);
  expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({isActive:true,id:{in:['seller']},roles:{some:{role:{name:'Vendedor'}}}});
 });
 it('restricts supervisor discovery to current subordinates',async()=>{
  await service.sellers(supervisor);expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('supervisor');
 });
 it('rejects assignment outside the authorized team',async()=>{
  await expect(service.createActivity(supervisor,{title:'Visit',kind:'VISIT',assigneeId:'outsider',startsAt:'2026-10-07T15:00:00Z'})).rejects.toThrow();
  expect(prisma.teamActivity.create).not.toHaveBeenCalled();
 });
 it('rejects completing activity after seller leaves team',async()=>{
  prisma.teamActivity.findUnique.mockResolvedValue({id:'activity',assigneeId:'outsider'});
  await expect(service.complete(supervisor,'activity')).rejects.toThrow();expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
 });
 it('restricts requests to their creator for supervisor',()=>{
  service.requests(supervisor);expect(prisma.teamRequest.findMany.mock.calls[0][0].where).toEqual({creatorId:'supervisor'});
 });
 it('allows admin inbox to show requests from every supervisor',()=>{
  service.requests(admin);expect(prisma.teamRequest.findMany.mock.calls[0][0].where).toEqual({});
 });
 it('rejects supervisor review even when called without controller guard',async()=>{
  await expect(service.review(supervisor,'request',{status:'APPROVED',response:'Yes'})).rejects.toThrow();expect(prisma.teamRequest.updateMany).not.toHaveBeenCalled();
 });
 it('atomically resolves only pending requests without changing users',async()=>{
  await service.review(admin,'request',{status:'APPROVED',response:'Authorized'});
  expect(prisma.teamRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'request',status:'PENDING'},data:expect.objectContaining({reviewerId:'admin',status:'APPROVED',response:'Authorized'})}));
 });
 it('rejects repeated or concurrent decisions',async()=>{
  prisma.teamRequest.updateMany.mockResolvedValue({count:0});await expect(service.review(admin,'request',{status:'REJECTED',response:'No'})).rejects.toThrow();
 });
});

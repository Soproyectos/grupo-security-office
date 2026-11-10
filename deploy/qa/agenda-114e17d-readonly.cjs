'use strict';
// Read-only service checks. No sessions, activities or grants are created.
const { PrismaService } = require('/app/dist/src/prisma/prisma.service');
const { HierarchyService } = require('/app/dist/src/common/hierarchy/hierarchy.service');
const { AccessAssignmentsService } = require('/app/dist/src/common/security/access-assignments.service');
const { WorkflowService } = require('/app/dist/src/modules/team-workflow/workflow.service');
const { BASE_ACCESS_ROLES } = require('/app/dist/src/common/security/base-access');
(async () => {
 const db = new PrismaService();
 try {
  await db.$connect();
  const hierarchy = new HierarchyService(db);
  const workflow = new WorkflowService(db, hierarchy, new AccessAssignmentsService(db));
  const users = await db.user.findMany({where:{isActive:true,roles:{some:{role:{name:{in:[...BASE_ACCESS_ROLES]}}}}},select:{id:true,roles:{select:{role:{select:{name:true}}}}}});
  const result = {checkedUsers:0,managersWithActiveTeam:0,ownAgendaAllowed:0,derivedAssignAllowed:0,outsideTeamDenied:0,derivedCompleteDenied:0};
  for (const user of users) {
   const ctx={userId:user.id,roles:user.roles.map(item=>item.role.name)};
   const state=await workflow.accessState(ctx);
   if(!workflow.decision(state,'activities:read',user.id).allowed) throw new Error('own_read_denied');
   result.checkedUsers++; result.ownAgendaAllowed++;
   if(ctx.roles.includes('Super Admin')) continue;
   const subordinates=await hierarchy.getActiveInternalSubordinateIds(user.id);
   if(!subordinates.length) continue;
   result.managersWithActiveTeam++;
   if(!workflow.decision(state,'activities:assign',subordinates[0]).allowed) throw new Error('team_assign_denied');
   result.derivedAssignAllowed++;
   // The team helper itself never grants complete; explicit packages can still do so.
   if(!state.grants.some(grant=>grant.sourceId==='derived:team-hierarchy'&&grant.actionId==='activities:complete')) result.derivedCompleteDenied++;
   const outsider=users.find(candidate=>!state.teamOwnerIds.includes(candidate.id));
   if(outsider) {
    let denied=false; try { await workflow.requireTeamMember(ctx,outsider.id,state); } catch { denied=true; }
    if(!denied) throw new Error('outside_team_allowed');
    result.outsideTeamDenied++;
   }
  }
  console.log(JSON.stringify({ok:true,...result}));
 } finally { await db.$disconnect(); }
})().catch(()=>{ console.error(JSON.stringify({ok:false,error:'read_only_agenda_service_check_failed'})); process.exitCode=1; });

'use server';

import { redirect } from 'next/navigation';
import { boot } from '@/lib/boot';
import { getClient } from '@/lib/db';
import { dollarsToCents } from '@/lib/money';
import { requireWritableContext, shopAccess } from '@/lib/trial';
import { addChecklist, convertRequest, createAgreementVisit, createRequest, getOperationsSettings, moveStock, rows, saveAgreement, saveCrew, saveEquipment, saveInventoryItem, scheduleJob, setAgreementStatus, updateRequest } from '@/lib/operations';
import { safeAppPath } from '@/lib/auth';
import { prepareFollowUps, sendFollowUp, setRule } from '@/lib/operations-automations';

const str=(form:FormData,key:string)=>String(form.get(key)||'').trim();
const num=(form:FormData,key:string)=>Number(str(form,key)||0);
async function context(path:string) {
  const ctx=await requireWritableContext(path);
  if (!['owner','admin','manager'].includes(ctx.membership.role)) redirect(`${path}?error=Only+business+managers+can+make+this+change.`);
  return ctx;
}
async function run(path:string, action:()=>Promise<unknown>) {
  try { return await action(); } catch(error) { redirect(`${path}${path.includes('?')?'&':'?'}error=${encodeURIComponent(error instanceof Error ? error.message : 'This change could not be saved.')}`); }
}
export async function saveCrewAction(form:FormData) {
  const {org}=await context('/team');
  await run('/team',()=>saveCrew(org.id,{id:num(form,'id')||undefined,name:str(form,'name'),email:str(form,'email'),phone:str(form,'phone'),skills:str(form,'skills'),color:str(form,'color'),hourlyCostCents:dollarsToCents(str(form,'hourly_cost')),active:str(form,'active')!=='0'}));
  redirect('/team?ok=Crew+member+saved.');
}
export async function saveRequestAction(form:FormData) {
  const {org}=await context('/requests');
  await run('/requests',()=>createRequest(org.id,{name:str(form,'name'),email:str(form,'email'),phone:str(form,'phone'),address:str(form,'address'),service:str(form,'service'),description:str(form,'description'),preferredDate:str(form,'preferred_date'),priority:str(form,'priority')||'normal',submissionKey:str(form,'submission_key')}));
  redirect('/requests?ok=Request+added.');
}
export async function updateRequestAction(form:FormData) {
  const {org}=await context('/requests');
  await run('/requests',()=>updateRequest(org.id,num(form,'id'),str(form,'status')));
  redirect('/requests?ok=Request+updated.');
}
export async function convertRequestAction(form:FormData) {
  const {org}=await context('/requests');
  const result=await run('/requests',()=>convertRequest(org.id,num(form,'id'),str(form,'target')==='estimate'?'estimate':'job')) as {customerId:number;jobId:number|null;estimateId:number|null};
  redirect(result.jobId ? `/jobs/${result.jobId}` : `/estimates/${result.estimateId}/edit`);
}
export async function dispatchAction(form:FormData) {
  const path=safeAppPath(str(form,'next'),'/dispatch');
  const {org}=await context(path);
  await run(path,()=>scheduleJob(org.id,num(form,'job_id'),{start:str(form,'start'),duration:num(form,'duration'),memberId:num(form,'member_id')||null,version:form.has('version')?num(form,'version'):undefined,priority:str(form,'priority')||undefined}));
  redirect(path);
}
export async function saveAgreementAction(form:FormData) {
  const {org}=await context('/agreements');
  await run('/agreements',()=>saveAgreement(org.id,{id:num(form,'id')||undefined,customerId:num(form,'customer_id'),name:str(form,'name'),amountCents:dollarsToCents(str(form,'amount')),billingMonths:num(form,'billing_months'),visitMonths:num(form,'visit_months'),nextVisit:str(form,'next_visit'),renewsOn:str(form,'renews_on'),notes:str(form,'notes')}));
  redirect('/agreements?ok=Service+agreement+saved.');
}
export async function agreementStatusAction(form:FormData) {
  const {org}=await context('/agreements');
  await run('/agreements',()=>setAgreementStatus(org.id,num(form,'id'),str(form,'status')));
  redirect('/agreements');
}
export async function agreementVisitAction(form:FormData) {
  const {org}=await context('/agreements');
  const id=await run('/agreements',()=>createAgreementVisit(org.id,num(form,'id'),str(form,'occurrence')));
  redirect(`/jobs/${id}`);
}
export async function saveEquipmentAction(form:FormData) {
  const {org}=await context('/equipment');
  await run('/equipment',()=>saveEquipment(org.id,{id:num(form,'id')||undefined,customerId:num(form,'customer_id'),propertyId:num(form,'property_id')||null,name:str(form,'name'),model:str(form,'model'),serial:str(form,'serial'),installedOn:str(form,'installed_on'),warrantyUntil:str(form,'warranty_until'),nextService:str(form,'next_service'),notes:str(form,'notes')}));
  redirect('/equipment?ok=Equipment+saved.');
}
export async function saveInventoryAction(form:FormData) {
  const {org}=await context('/inventory');
  await run('/inventory',()=>saveInventoryItem(org.id,{name:str(form,'name'),sku:str(form,'sku'),location:str(form,'location'),supplier:str(form,'supplier'),quantity:num(form,'quantity'),reorderAt:num(form,'reorder_at'),unitCostCents:dollarsToCents(str(form,'unit_cost'))}));
  redirect('/inventory?ok=Part+added.');
}
export async function moveStockAction(form:FormData) {
  const {org}=await context('/inventory');
  await run('/inventory',()=>moveStock(org.id,{itemId:num(form,'item_id'),jobId:num(form,'job_id')||null,delta:str(form,'direction')==='use'?-num(form,'quantity'):num(form,'quantity'),note:str(form,'note'),mutationId:str(form,'mutation_id')}));
  redirect('/inventory?ok=Stock+updated.');
}
export async function addChecklistAction(form:FormData) {
  const id=num(form,'job_id');
  const path=`/field?job=${id}`;
  const {org}=await context(path);
  await run(path,()=>addChecklist(org.id,id,str(form,'label')));
  redirect(path);
}
export async function bookingSettingsAction(form:FormData) {
  const {org}=await context('/requests');
  const previous=await getOperationsSettings(org.id);
  await run('/requests',()=>getClient().execute({sql:'INSERT INTO operations_settings (organization_id,booking_enabled,booking_intro,service_area,timezone) VALUES (?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET booking_enabled=excluded.booking_enabled,booking_intro=excluded.booking_intro,service_area=excluded.service_area',args:[org.id,form.get('booking_enabled')==='on'?1:0,str(form,'booking_intro').slice(0,500)||previous.bookingIntro,str(form,'service_area').slice(0,300),previous.timezone]}));
  redirect('/requests?ok=Online+request+settings+saved.');
}
export async function publicRequestAction(form:FormData) {
  await boot();
  const slug=str(form,'slug'),path=`/book/${encodeURIComponent(slug)}`;
  if (str(form,'website')) redirect(`${path}?sent=1`);
  const [org]=await rows<{id:number;plan:string;trialEndsAt:string}>('SELECT id,plan,trial_ends_at FROM organizations WHERE slug=?',[slug]);
  if (!org || shopAccess(org,false).frozen) redirect(`${path}?error=Online+requests+are+currently+closed.`);
  await run(path,()=>createRequest(org.id,{name:str(form,'name'),email:str(form,'email'),phone:str(form,'phone'),address:str(form,'address'),service:str(form,'service'),description:str(form,'description'),preferredDate:str(form,'preferred_date'),priority:'normal',submissionKey:str(form,'submission_key')},true));
  redirect(`${path}?sent=1`);
}
export async function automationRuleAction(form:FormData) {
  const {org}=await context('/automations');
  await run('/automations',()=>setRule(org.id,str(form,'kind'),form.get('enabled')==='on',num(form,'delay_days')));
  redirect('/automations?ok=Follow-up+rule+saved.');
}
export async function prepareFollowUpsAction() {
  const {org}=await context('/automations');
  const result=await run('/automations',()=>prepareFollowUps(org.id));
  redirect(`/automations?ok=${encodeURIComponent(`${result} follow-up drafts ready. Review before sending.`)}`);
}
export async function sendFollowUpAction(form:FormData) {
  const {org}=await context('/automations');
  await run('/automations',()=>sendFollowUp(org.id,num(form,'id')));
  redirect('/automations?ok=Follow-up+processed.');
}
export async function cancelFollowUpAction(form:FormData) {
  const {org}=await context('/automations');
  await run('/automations',()=>getClient().execute({sql:"UPDATE outbox_messages SET status='cancelled' WHERE organization_id=? AND id=? AND status IN ('draft','failed')",args:[org.id,num(form,'id')]}));
  redirect('/automations');
}

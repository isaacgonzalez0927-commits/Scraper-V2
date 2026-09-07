import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, after, test } from 'node:test';
import { ensureSchema, getClient, nowISO, token } from '../lib/db';
import { addChecklist, convertRequest, createRequest, getChecklist, moveStock, rows, saveCrew, saveFieldEntry, saveInventoryItem, saveJobWithDispatch, scheduleJob } from '../lib/operations';
import { closeJob, invoiceJob, type CloseJobInput } from '../lib/job-closeout';
import { convertApprovedEstimate } from '../lib/estimates';
import { jobIsUnbilled } from '../lib/collect';
import { jobRevenueCents } from '../lib/queries';
import { operationsBrief } from '../lib/operations-brief';
import { runNovaTool } from '../lib/nova/tools';

const directory=mkdtempSync(join(tmpdir(),'sere-workflow-test-'));
const envKeys=['DATABASE_URL','TURSO_DATABASE_URL','LIBSQL_URL','VERCEL'] as const;
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
before(async()=>{ for(const key of envKeys)delete process.env[key];process.env.DATABASE_URL=`file:${directory}/workflow.db`;await ensureSchema(); });
after(()=>{getClient().close();for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}rmSync(directory,{recursive:true,force:true});});

async function fixture() {
  const key=token(),now=nowISO(),c=getClient();
  const org=Number((await c.execute({sql:'INSERT INTO organizations (name,slug,created_at) VALUES (?,?,?)',args:[`Shop ${key}`,key,now]})).lastInsertRowid);
  const customer=Number((await c.execute({sql:'INSERT INTO customers (organization_id,name,email,service_line1,public_token,created_at,customer_since) VALUES (?,?,?,?,?,?,?)',args:[org,'Pat Homeowner',`${key}@example.com`,'1 Old Street',token(),now,now.slice(0,10)]})).lastInsertRowid);
  const user=Number((await c.execute({sql:'INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)',args:['Owner',`${key}@owner.example`,'not-a-real-login',now]})).lastInsertRowid);
  await c.execute({sql:'INSERT INTO memberships (organization_id,user_id,role,created_at) VALUES (?,?,?,?)',args:[org,user,'owner',now]});
  const crew=await saveCrew(org,{name:'Alex',email:'',phone:'',skills:'Service',color:'#2255aa',hourlyCostCents:6000,active:true});
  const job=await saveJobWithDispatch(org,0,{customerId:customer,title:'Repair',description:'Original work scope',status:'unscheduled',teamMemberId:crew,estimatedRevenueCents:25000});
  return {org,customer,user,crew,job,email:`${key}@example.com`};
}
function closeInput(over:Partial<CloseJobInput>={}):CloseJobInput{return {mutationId:token(),version:0,workCompleted:'Replaced failed part and tested system',noCharge:false,reason:'',finalAmountCents:25000,extraCostCents:1200,costDescription:'Replacement part',costCategory:'materials',...over};}

test('request → draft → approved estimate → job retains address, priority and identity',async()=>{
  const f=await fixture();
  const request=await createRequest(f.org,{name:'Pat Homeowner',email:f.email,phone:'555',address:'42 New Street',service:'Repair upstairs system',description:'Stops cooling after ten minutes',preferredDate:'',priority:'urgent',submissionKey:token()});
  const first=await convertRequest(f.org,request,'estimate'),retry=await convertRequest(f.org,request,'estimate');
  assert.deepEqual(retry,first);assert.equal(first.customerId,f.customer);assert.ok(first.estimateId);
  const draft=(await rows<{notes:string;status:string}>('SELECT notes,status FROM estimates WHERE id=?',[first.estimateId!]))[0];
  assert.equal(draft.notes,'Stops cooling after ten minutes');assert.equal(draft.status,'draft');
  await getClient().execute({sql:"UPDATE estimates SET status='approved',approved_at=?,subtotal_cents=10000,discount_cents=1000,tax_cents=900,total_cents=9900,tax_bps=1000 WHERE id=?",args:[nowISO(),first.estimateId!]});
  const job=await convertApprovedEstimate(f.org,first.estimateId!);
  const linked=(await rows<{jobId:number;status:string}>('SELECT job_id,status FROM service_requests WHERE id=?',[request]))[0];
  const work=(await rows<{serviceLine1:string;priority:string}>('SELECT service_line1,priority FROM jobs WHERE id=?',[job.jobId]))[0];
  assert.equal(linked.jobId,job.jobId);assert.equal(linked.status,'booked');assert.equal(work.serviceLine1,'42 New Street');assert.equal(work.priority,'urgent');
  assert.equal((await rows<{estimatedRevenueCents:number}>('SELECT estimated_revenue_cents FROM jobs WHERE id=?',[job.jobId]))[0].estimatedRevenueCents,9000);
  assert.equal((await convertRequest(f.org,request,'job')).jobId,job.jobId);
  const invoice=await invoiceJob(f.org,job.jobId);
  assert.equal(invoice.invoice.totalCents,9900,'Approved tax is applied exactly once, preserving the discounted charge.');
});

test('dispatch rejects overlaps, stale versions, and foreign crew without changing the job',async()=>{
  const f=await fixture(),foreign=await fixture();
  await scheduleJob(f.org,f.job,{start:'2026-10-12T09:00',duration:60,version:0});
  const second=await saveJobWithDispatch(f.org,0,{customerId:f.customer,title:'Other visit',status:'unscheduled',teamMemberId:f.crew});
  await assert.rejects(()=>scheduleJob(f.org,second,{start:'2026-10-12T09:30'}),/already assigned/);
  await assert.rejects(()=>scheduleJob(f.org,f.job,{start:'2026-10-12T11:00',version:0}),/schedule changed/);
  await assert.rejects(()=>scheduleJob(f.org,f.job,{start:'2026-10-12T11:00',memberId:foreign.crew}),/unavailable/);
  assert.equal((await rows<{scheduledStart:string}>('SELECT scheduled_start FROM jobs WHERE id=?',[f.job]))[0].scheduledStart,'2026-10-12T09:00');
});

test('closeout rolls back until the field checklist is synced',async()=>{
  const f=await fixture();await addChecklist(f.org,f.job,'Test operation');
  const input=closeInput();await assert.rejects(()=>closeJob(f.org,f.job,input),/checklist/);
  assert.equal((await rows<{status:string}>('SELECT status FROM jobs WHERE id=?',[f.job]))[0].status,'unscheduled');
  assert.equal((await rows('SELECT id FROM invoices WHERE organization_id=?',[f.org])).length,0);
  const item=(await getChecklist(f.org,f.job))[0];
  await saveFieldEntry(f.org,f.user,{jobId:f.job,kind:'checklist',body:'',minutes:0,capturedAt:nowISO(),mutationId:token(),checklistId:item.id,done:true,version:item.version});
  assert.ok((await closeJob(f.org,f.job,input)).invoiceId);
});

test('closeout retries keep one invoice and one cost, preserving original scope',async()=>{
  const f=await fixture(),input=closeInput();
  const first=await closeJob(f.org,f.job,input),retry=await closeJob(f.org,f.job,input);
  assert.equal(first.invoiceId,retry.invoiceId);assert.equal(retry.duplicate,true);
  assert.equal((await rows('SELECT id FROM invoices WHERE organization_id=?',[f.org])).length,1);
  assert.equal((await rows('SELECT id FROM job_costs WHERE organization_id=?',[f.org])).length,1);
  const job=(await rows<{description:string;completionSummary:string}>('SELECT description,completion_summary FROM jobs WHERE id=?',[f.job]))[0];
  assert.equal(job.description,'Original work scope');assert.equal(job.completionSummary,input.workCompleted);
  await assert.rejects(()=>closeJob(f.org,f.job,{...input,finalAmountCents:35000}),/different details/);
  await assert.rejects(()=>closeJob(f.org,f.job,{...input,mutationId:token()}),/job changed/);
  assert.equal((await invoiceJob(f.org,f.job)).invoice.id,first.invoiceId);
});

test('no-charge work creates no invoice and is not unbilled revenue',async()=>{
  const f=await fixture();await closeJob(f.org,f.job,closeInput({noCharge:true,reason:'Warranty visit',finalAmountCents:0,extraCostCents:0}));
  const job=(await rows<{id:number;status:string;noCharge:number;actualRevenueCents:number;estimatedRevenueCents:number}>('SELECT * FROM jobs WHERE id=?',[f.job]))[0];
  assert.equal(jobIsUnbilled(job,new Set()),false);assert.equal(jobRevenueCents(job),0);
  await assert.rejects(()=>invoiceJob(f.org,f.job),/no charge/);
  await assert.rejects(()=>closeJob(f.org,f.job,closeInput({version:1})),/no charge/);
  assert.equal((await rows('SELECT id FROM invoices WHERE organization_id=?',[f.org])).length,0);
});

test('closeout preserves invoice discounts and descriptions and respects sent totals',async()=>{
  const f=await fixture(),draft=await invoiceJob(f.org,f.job),invoiceId=draft.invoice.id;
  await getClient().execute({sql:'UPDATE invoices SET discount_cents=1000,tax_bps=1000,tax_cents=2400,total_cents=26400 WHERE id=?',args:[invoiceId]});
  await getClient().execute({sql:"UPDATE invoice_lines SET description='Diagnosis and replacement' WHERE invoice_id=?",args:[invoiceId]});
  await closeJob(f.org,f.job,closeInput({finalAmountCents:27000}));
  const invoice=(await rows<{subtotalCents:number;discountCents:number;taxCents:number;totalCents:number}>('SELECT * FROM invoices WHERE id=?',[invoiceId]))[0];
  assert.equal(invoice.subtotalCents,28000);assert.equal(invoice.discountCents,1000);assert.equal(invoice.taxCents,2700);assert.equal(invoice.totalCents,29700);
  assert.equal((await rows<{description:string}>('SELECT description FROM invoice_lines WHERE invoice_id=?',[invoiceId]))[0].description,'Diagnosis and replacement');
  await getClient().execute({sql:"UPDATE invoices SET status='sent' WHERE id=?",args:[invoiceId]});
  await assert.rejects(()=>closeJob(f.org,f.job,closeInput({version:1,finalAmountCents:28000,extraCostCents:0})),/sent invoice/);
  const result=await closeJob(f.org,f.job,closeInput({version:1,finalAmountCents:27000,extraCostCents:0}));
  assert.equal(result.invoiceId,invoiceId);
});

test('an itemized invoice mismatch rolls back closeout, while matching charges preserve its lines',async()=>{
  const f=await fixture(),draft=await invoiceJob(f.org,f.job),invoiceId=draft.invoice.id;
  await getClient().execute({sql:'UPDATE invoice_lines SET unit_price_cents=20000,amount_cents=20000 WHERE invoice_id=?',args:[invoiceId]});
  await getClient().execute({sql:"INSERT INTO invoice_lines (organization_id,invoice_id,position,description,quantity,unit_price_cents,amount_cents) VALUES (?,?,1,'Parts','1',5000,5000)",args:[f.org,invoiceId]});
  const before=await rows('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY position',[invoiceId]);
  await assert.rejects(()=>closeJob(f.org,f.job,closeInput({finalAmountCents:30000})),/itemized invoice/);
  assert.equal((await rows<{status:string}>('SELECT status FROM jobs WHERE id=?',[f.job]))[0].status,'unscheduled');
  assert.equal((await rows('SELECT id FROM job_costs WHERE organization_id=?',[f.org])).length,0);
  assert.equal((await rows('SELECT * FROM job_closeouts WHERE organization_id=?',[f.org])).length,0);
  assert.equal((await closeJob(f.org,f.job,closeInput())).invoiceId,invoiceId);
  assert.deepEqual(await rows('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY position',[invoiceId]),before);
});

test('no-charge closeout cannot hide a live invoice or foreign job',async()=>{
  const f=await fixture(),other=await fixture();await invoiceJob(f.org,f.job);
  await assert.rejects(()=>closeJob(f.org,f.job,closeInput({noCharge:true,reason:'Warranty',finalAmountCents:0})),/already has an invoice/);
  await assert.rejects(()=>closeJob(other.org,f.job,closeInput()),/not found/);
});

test('stock and field time write costs once on retry',async()=>{
  const f=await fixture();await saveInventoryItem(f.org,{name:'Filter',sku:'FLT',location:'Truck',supplier:'',quantity:2,reorderAt:1,unitCostCents:500});
  const item=(await rows<{id:number}>('SELECT id FROM inventory_items WHERE organization_id=?',[f.org]))[0];
  const movement={itemId:item.id,jobId:f.job,delta:-1,note:'Used on visit',mutationId:token()};
  await moveStock(f.org,movement);await moveStock(f.org,movement);
  await assert.rejects(()=>moveStock(f.org,{...movement,delta:-2,mutationId:token()}),/not enough stock/);
  const time={jobId:f.job,kind:'time',body:'Diagnosis',minutes:30,capturedAt:nowISO(),mutationId:token()};
  await saveFieldEntry(f.org,f.user,time);await saveFieldEntry(f.org,f.user,time);
  const costs=await rows<{amountCents:number}>('SELECT amount_cents FROM job_costs WHERE organization_id=?',[f.org]);
  assert.deepEqual(costs.map(c=>c.amountCents).sort((a,b)=>a-b),[500,3000]);
});

test('Serenity shares dispatch checks and requires owner closeout instead of marking work done',async()=>{
  const f=await fixture();await scheduleJob(f.org,f.job,{start:'2026-10-12T09:00'});
  const second=await saveJobWithDispatch(f.org,0,{customerId:f.customer,title:'Second job',status:'unscheduled',teamMemberId:f.crew});
  const ctx={organizationId:f.org,isDemo:false,writable:true,now:new Date('2026-10-12T08:00:00Z'),persona:'serenity' as const};
  const move=JSON.parse(await runNovaTool(ctx,'move_job',JSON.stringify({job_id:second,when:'2026-10-12 at 9am'})));
  assert.equal(move.ok,false);
  const complete=JSON.parse(await runNovaTool(ctx,'complete_job',JSON.stringify({job_id:f.job})));
  assert.equal(complete.actionRequired,'review_closeout');
  assert.equal((await rows<{status:string}>('SELECT status FROM jobs WHERE id=?',[f.job]))[0].status,'scheduled');
});

test('Serenity operational context does not leak another shop',async()=>{
  const f=await fixture(),other=await fixture();
  await createRequest(other.org,{name:'Private customer',email:'private@example.com',phone:'',address:'',service:'Private service',description:'',preferredDate:'',priority:'normal',submissionKey:token()});
  assert.equal(JSON.stringify(await operationsBrief(f.org)).includes('Private'),false);
});

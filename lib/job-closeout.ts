import type { Transaction } from '@libsql/client';
import { nowISO, token } from './db';
import { totalsFromLines } from './finance';
import { closeoutDueDate } from './closeout';
import { rows, write } from './operations';
import { integer, requiredText } from './operations-validation';
import type { invoices, jobs, organizations } from './schema';

type Job = typeof jobs.$inferSelect;
type Invoice = typeof invoices.$inferSelect;
type Shop = typeof organizations.$inferSelect;

async function ownedJob(tx:Transaction,org:number,id:number) {
  const [job] = await rows<Job>('SELECT * FROM jobs WHERE organization_id=? AND id=?',[org,id],tx);
  if (!job) throw new Error('Job not found in this business.');
  return job;
}

/** The invoice, its lines, numbering, and history commit together. */
async function invoiceInTransaction(tx:Transaction,org:number,job:Job,syncDraft:boolean) {
  if (job.noCharge) throw new Error('This job is marked no charge. Reopen it before billing.');
  const [existing] = await rows<Invoice>("SELECT * FROM invoices WHERE organization_id=? AND job_id=? AND status<>'void' ORDER BY id LIMIT 1",[org,job.id],tx);
  const price = job.actualRevenueCents || job.estimatedRevenueCents;
  if (existing) {
    if (syncDraft && existing.status==='draft' && price!==Math.max(0,existing.subtotalCents-existing.discountCents)) {
      const lines = await rows<{id:number}>('SELECT id FROM invoice_lines WHERE organization_id=? AND invoice_id=?',[org,existing.id],tx);
      if (lines.length===1) {
        const linePrice=price+existing.discountCents;
        const calc=totalsFromLines([{quantity:'1',unitPriceCents:linePrice}],existing.discountCents,existing.taxBps);
        await tx.execute({sql:"UPDATE invoice_lines SET quantity='1',unit_price_cents=?,amount_cents=? WHERE organization_id=? AND id=?",args:[linePrice,linePrice,org,lines[0].id]});
        await tx.execute({sql:'UPDATE invoices SET subtotal_cents=?,discount_cents=?,tax_cents=?,total_cents=? WHERE organization_id=? AND id=?',args:[calc.subtotalCents,calc.discountCents,calc.taxCents,calc.totalCents,org,existing.id]});
        return {invoice:{...existing,...calc},created:false};
      }
      throw new Error('The final charge differs from the itemized invoice. Edit its line items before finishing this job.');
    }
    return {invoice:existing,created:false};
  }
  const [shop] = await rows<Shop>('SELECT * FROM organizations WHERE id=?',[org],tx);
  if (!shop) throw new Error('Business not found.');
  const [approved]=await rows<{taxBps:number}>('SELECT tax_bps FROM estimates WHERE organization_id=? AND converted_job_id=? ORDER BY id LIMIT 1',[org,job.id],tx);
  const taxBps=approved?.taxBps??shop.defaultTaxBps;
  const now=nowISO(), issue=now.slice(0,10), number=`${shop.invoicePrefix}${shop.nextInvoiceNumber}`;
  const calc=totalsFromLines([{quantity:'1',unitPriceCents:price}],0,taxBps);
  await tx.execute({sql:'UPDATE organizations SET next_invoice_number=next_invoice_number+1 WHERE id=?',args:[org]});
  const result=await tx.execute({sql:"INSERT INTO invoices (organization_id,customer_id,job_id,number,status,issue_date,due_date,notes,tax_bps,public_token,created_at,subtotal_cents,discount_cents,tax_cents,total_cents) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?)",args:[org,job.customerId,job.id,number,issue,closeoutDueDate(issue,shop.paymentTermsDays),shop.defaultInvoiceNotes,taxBps,token(),now,calc.subtotalCents,calc.discountCents,calc.taxCents,calc.totalCents]});
  const id=Number(result.lastInsertRowid);
  await tx.execute({sql:"INSERT INTO invoice_lines (organization_id,invoice_id,position,description,quantity,unit_price_cents,amount_cents) VALUES (?,?,0,?,'1',?,?)",args:[org,id,job.title,price,price]});
  await tx.execute({sql:"INSERT INTO invoice_events (organization_id,invoice_id,kind,message,created_at) VALUES (?,?,'created',?,?)",args:[org,id,`${number} created from job`,now]});
  await tx.execute({sql:"INSERT INTO activities (organization_id,kind,title,amount_cents,link,created_at) VALUES (?,'invoice_created',?,?,?,?)",args:[org,`${number} created`,calc.totalCents,`/invoices/${id}`,now]});
  return {invoice:(await rows<Invoice>('SELECT * FROM invoices WHERE organization_id=? AND id=?',[org,id],tx))[0],created:true};
}

export async function invoiceJob(org:number,id:number,syncDraft=false) {
  return write(async tx=>invoiceInTransaction(tx,org,await ownedJob(tx,org,id),syncDraft));
}

export type CloseJobInput = {
  mutationId:string; version:number; workCompleted:string; noCharge:boolean; reason:string;
  finalAmountCents:number; extraCostCents:number; costDescription:string; costCategory:string;
};

/** Save completion, costs and invoice once, or save none of them. */
export async function closeJob(org:number,id:number,input:CloseJobInput) {
  const key=requiredText(input.mutationId,'Closeout key',100);
  requiredText(input.workCompleted,'Work completed',6000);
  if(input.noCharge)requiredText(input.reason,'No-charge reason',2000);
  integer(input.version,'Job version',0);
  integer(input.finalAmountCents,'Final amount',input.noCharge?0:1,1_000_000_000);
  integer(input.extraCostCents,'Extra cost',0,1_000_000_000);
  if(input.extraCostCents)requiredText(input.costDescription,'Cost description',1000);
  const fingerprint=JSON.stringify({id,...input});
  return write(async tx=>{
    const job=await ownedJob(tx,org,id);
    const [prior]=await rows<{fingerprint:string;invoiceId:number|null}>('SELECT fingerprint,invoice_id FROM job_closeouts WHERE organization_id=? AND mutation_id=?',[org,key],tx);
    if(prior) {
      if(prior.fingerprint!==fingerprint)throw new Error('This closeout was already saved with different details. Refresh the job.');
      return {invoiceId:prior.invoiceId,duplicate:true};
    }
    if(job.scheduleVersion!==input.version)throw new Error('This job changed. Refresh before finishing it.');
    if(job.status==='cancelled')throw new Error('Reopen the cancelled job before finishing it.');
    if(job.noCharge && !input.noCharge)throw new Error('This job is marked no charge. Reopen it before billing.');
    const incomplete=await rows('SELECT id FROM job_checklist WHERE organization_id=? AND job_id=? AND done=0',[org,id],tx);
    if(incomplete.length)throw new Error('Complete and sync the field checklist before finishing this job.');
    const [existing]=await rows<Invoice>("SELECT * FROM invoices WHERE organization_id=? AND job_id=? AND status<>'void' LIMIT 1",[org,id],tx);
    if(input.noCharge && existing)throw new Error('This job already has an invoice. Resolve that invoice before marking the visit no charge.');
    if(existing && existing.status!=='draft' && input.finalAmountCents!==Math.max(0,existing.subtotalCents-existing.discountCents))throw new Error('The final amount differs from the sent invoice. Resolve the invoice before changing the charge.');
    const now=nowISO(),amount=input.noCharge?0:input.finalAmountCents;
    await tx.execute({sql:"UPDATE jobs SET completion_summary=?,actual_revenue_cents=?,no_charge=?,status='completed',completed_at=coalesce(completed_at,?),schedule_version=schedule_version+1 WHERE organization_id=? AND id=?",args:[input.workCompleted,amount,input.noCharge?1:0,now,org,id]});
    if(input.extraCostCents)await tx.execute({sql:'INSERT INTO job_costs (organization_id,job_id,category,description,amount_cents,created_at) VALUES (?,?,?,?,?,?)',args:[org,id,input.costCategory||'miscellaneous',input.costDescription,input.extraCostCents,now]});
    await tx.execute({sql:'INSERT INTO notes (organization_id,customer_id,job_id,body,created_at) VALUES (?,?,?,?,?)',args:[org,job.customerId,id,input.noCharge?`No charge. ${input.reason}\n${input.workCompleted}`:`Work completed: ${input.workCompleted}`,now]});
    await tx.execute({sql:"INSERT INTO activities (organization_id,kind,title,amount_cents,link,created_at) VALUES (?,'job_completed',?,?,?,?)",args:[org,`Job completed: ${job.title}`,amount,`/jobs/${id}`,now]});
    const invoiceId=input.noCharge?null:(await invoiceInTransaction(tx,org,{...job,actualRevenueCents:amount,noCharge:false},true)).invoice.id;
    await tx.execute({sql:'INSERT INTO job_closeouts (organization_id,mutation_id,job_id,fingerprint,invoice_id,created_at) VALUES (?,?,?,?,?,?)',args:[org,key,id,fingerprint,invoiceId,now]});
    return {invoiceId,duplicate:false};
  });
}

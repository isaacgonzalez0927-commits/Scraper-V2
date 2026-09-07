import { rows } from '@/lib/operations';
import { formatMoney } from '@/lib/money';

export async function JobJourney({organizationId,jobId,noCharge}:{organizationId:number;jobId:number;noCharge:boolean}) {
  const [requests,estimates,invoices]=await Promise.all([
    rows<{id:number}>('SELECT id FROM service_requests WHERE organization_id=? AND job_id=? ORDER BY id LIMIT 1',[organizationId,jobId]),
    rows<{id:number;number:string}>('SELECT id,number FROM estimates WHERE organization_id=? AND converted_job_id=? ORDER BY id LIMIT 1',[organizationId,jobId]),
    rows<{id:number;number:string;status:string;totalCents:number;paid:number}>("SELECT i.id,i.number,i.status,i.total_cents,coalesce((SELECT sum(p.amount_cents) FROM payments p WHERE p.organization_id=i.organization_id AND p.invoice_id=i.id AND p.voided_at IS NULL),0) AS paid FROM invoices i WHERE i.organization_id=? AND i.job_id=? AND i.status<>'void' ORDER BY i.id",[organizationId,jobId]),
  ]);
  const remaining=invoices.reduce((sum,i)=>sum+Math.max(0,i.totalCents-i.paid),0);
  return <nav className="job-journey" aria-label="Linked request, estimate, job and billing records">
    {requests[0]?<a href="/requests"><span>Request</span><strong>#{requests[0].id}</strong></a>:null}
    {estimates[0]?<a href={`/estimates/${estimates[0].id}`}><span>Estimate</span><strong>{estimates[0].number}</strong></a>:null}
    <a href={`/field?job=${jobId}`}><span>Visit</span><strong>Field record</strong></a>
    {noCharge?<div><span>Billing</span><strong>No charge</strong></div>:invoices.length?<><a href={`/invoices/${invoices[0].id}`}><span>Invoice{invoices.length>1?'s':''}</span><strong>{invoices.length>1?`${invoices.length} linked`:invoices[0].number}</strong></a><a href={`/invoices/${invoices[0].id}`}><span>{invoices.some(i=>i.status==='draft')?'Draft / open balance':'Remaining balance'}</span><strong>{formatMoney(remaining)}</strong></a></>:<a href={`/jobs/${jobId}/finish`}><span>Next step</span><strong>Finish and collect</strong></a>}
  </nav>;
}

import type { Transaction } from '@libsql/client';
import { getClient, nowISO } from './db';
import { emailConfig } from './integrations';
import { sendEmail } from './email';
import { formatMoney } from './money';
import { rows, write } from './operations';
import { integer, RULES, type RuleKind } from './operations-validation';
import { DEMO_EMAIL } from './seed';

export type AutomationRule={kind:RuleKind;enabled:number;delayDays:number};
export type OutboxMessage={id:number;customerId:number;entityId:number;kind:RuleKind;subject:string;body:string;status:string;recipient:string;error:string;providerId:string;createdAt:string;sentAt:string|null;dedupeKey:string};
type Candidate={id:number;customerId:number;name:string;email:string;number:string;date:string;amount:number;publicToken:string};
export const getRules=(org:number)=>rows<AutomationRule>('SELECT * FROM automation_rules WHERE organization_id=?',[org]);
export const getOutbox=(org:number)=>rows<OutboxMessage>('SELECT * FROM outbox_messages WHERE organization_id=? ORDER BY created_at DESC LIMIT 100',[org]);
export async function setRule(org:number,kind:string,enabled:boolean,delay:number) {
  if (!(kind in RULES)) throw new Error('Choose a supported follow-up rule.');
  integer(delay,'Delay',0,90);
  await getClient().execute({sql:'INSERT INTO automation_rules (organization_id,kind,enabled,delay_days) VALUES (?,?,?,?) ON CONFLICT(organization_id,kind) DO UPDATE SET enabled=excluded.enabled,delay_days=excluded.delay_days',args:[org,kind,enabled?1:0,delay]});
}
async function candidates(org:number,rule:AutomationRule,tx?:Transaction):Promise<Candidate[]> {
  const date=new Date(Date.now()-rule.delayDays*86400000).toISOString().slice(0,10);
  const today=nowISO().slice(0,10);
  if (rule.kind==='invoice') return rows<Candidate>(`SELECT i.id,i.customer_id,c.name,c.email,i.number,i.due_date AS date,i.public_token,
    i.total_cents-coalesce((SELECT sum(p.amount_cents) FROM payments p WHERE p.organization_id=i.organization_id AND p.invoice_id=i.id AND p.voided_at IS NULL),0) AS amount
    FROM invoices i JOIN customers c ON c.organization_id=i.organization_id AND c.id=i.customer_id
    WHERE i.organization_id=? AND i.status IN ('sent','viewed','partial','overdue') AND i.voided_at IS NULL AND i.due_date<=? AND c.archived_at IS NULL AND c.email<>'' AND amount>0`,[org,date],tx);
  if (rule.kind==='estimate') return rows<Candidate>(`SELECT e.id,e.customer_id,c.name,c.email,e.number,substr(e.sent_at,1,10) AS date,e.public_token,e.total_cents AS amount
    FROM estimates e JOIN customers c ON c.organization_id=e.organization_id AND c.id=e.customer_id
    WHERE e.organization_id=? AND e.status IN ('sent','viewed') AND e.sent_at IS NOT NULL AND substr(e.sent_at,1,10)<=? AND e.valid_until>=? AND c.archived_at IS NULL AND c.email<>''`,[org,date,today],tx);
  return rows<Candidate>(`SELECT a.id,a.customer_id,c.name,c.email,a.name AS number,a.next_visit AS date,'' AS public_token,0 AS amount
    FROM service_agreements a JOIN customers c ON c.organization_id=a.organization_id AND c.id=a.customer_id
    WHERE a.organization_id=? AND a.status='active' AND a.next_visit<=? AND c.archived_at IS NULL AND c.email<>''`,[org,date],tx);
}
function messageFor(kind:RuleKind,row:Candidate,shop:string) {
  const subject=kind==='invoice'?`${shop}: reminder for ${row.number}`:kind==='estimate'?`${shop}: your estimate ${row.number}`:`${shop}: time for your next service`;
  const body=kind==='invoice'?`Hi ${row.name},\n\nThere is a remaining balance of ${formatMoney(row.amount)} on invoice ${row.number}, due ${row.date}. Please use the payment link on your invoice, or reply if you have a question.\n\nThank you,\n${shop}`:kind==='estimate'?`Hi ${row.name},\n\nWould you like to move forward with estimate ${row.number} for ${formatMoney(row.amount)}? You can approve it using the link in your estimate, or reply with any questions.\n\nThank you,\n${shop}`:`Hi ${row.name},\n\nYour next ${row.number} visit is due ${row.date}. Please reply so we can find a convenient time.\n\nThank you,\n${shop}`;
  return {subject,body};
}
export async function prepareFollowUps(org:number) {
  const rules=await getRules(org);
  const [shop]=await rows<{name:string}>('SELECT name FROM organizations WHERE id=?',[org]);
  if (!shop) throw new Error('Business not found.');
  let made=0;
  for (const rule of rules.filter(r=>r.enabled)) {
    const eligible=await candidates(org,rule);
    for (const row of eligible) {
      const message=messageFor(rule.kind,row,shop.name);
      const result=await getClient().execute({sql:"INSERT INTO outbox_messages (organization_id,customer_id,entity_id,kind,subject,body,recipient,created_at,dedupe_key) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,dedupe_key) DO NOTHING",args:[org,row.customerId,row.id,rule.kind,message.subject,message.body,row.email,nowISO(),`${rule.kind}:${row.id}:${row.date}`]});
      made+=result.rowsAffected;
    }
  }
  return made;
}

export async function sendFollowUp(org:number,id:number) {
  const config=await emailConfig(org);
  if (!config) throw new Error('Connect email in Settings before sending a follow-up.');
  const [shop]=await rows<{name:string;operatingMode:string}>('SELECT name,operating_mode FROM organizations WHERE id=?',[org]);
  const demo=await rows('SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND u.email=?',[org,DEMO_EMAIL]);
  if (demo.length || shop.operatingMode==='sandbox') throw new Error('Follow-ups can be drafted here. Sending is available in your live business.');
  const claimed=await write(async tx=>{
    const [message]=await rows<OutboxMessage>('SELECT * FROM outbox_messages WHERE organization_id=? AND id=?',[org,id],tx);
    if (!message) throw new Error('Follow-up not found.');
    if (message.status==='sent' || message.status==='cancelled') return null;
    if (message.status!=='draft') throw new Error('This follow-up is already processing or needs delivery review.');
    const [rule]=await rows<AutomationRule>('SELECT * FROM automation_rules WHERE organization_id=? AND kind=?',[org,message.kind],tx);
    const eligible=rule?.enabled ? await candidates(org,rule,tx) : [];
    const current=eligible.find(c=>c.id===message.entityId && c.customerId===message.customerId);
    if (!current) {
      await tx.execute({sql:"UPDATE outbox_messages SET status='cancelled',error='No longer eligible for follow-up.' WHERE organization_id=? AND id=?",args:[org,id]});
      return null;
    }
    const fresh=messageFor(message.kind,current,shop.name);
    if (message.body!==fresh.body || message.recipient!==current.email) {
      await tx.execute({sql:'UPDATE outbox_messages SET subject=?,body=?,recipient=?,error=? WHERE organization_id=? AND id=?',args:[fresh.subject,fresh.body,current.email,'Details changed. Review this updated draft before sending.',org,id]});
      return 'changed' as const;
    }
    await tx.execute({sql:"UPDATE outbox_messages SET status='sending',locked_at=?,error='' WHERE organization_id=? AND id=?",args:[nowISO(),org,id]});
    return message;
  });
  if (claimed==='changed') throw new Error('The invoice or customer changed. Review the updated follow-up before sending.');
  if (!claimed) return;
  try {
    const providerId=await sendEmail(config,{to:claimed.recipient,subject:claimed.subject,text:claimed.body,idempotencyKey:`sere-followup/${org}/${id}`});
    if (!providerId) throw new Error('The email provider did not return a delivery reference.');
    await getClient().execute({sql:"UPDATE outbox_messages SET status='sent',provider_id=?,sent_at=?,error='' WHERE organization_id=? AND id=?",args:[providerId,nowISO(),org,id]});
  } catch(error) {
    // A network failure may happen after acceptance. Never blindly send a second email.
    await getClient().execute({sql:"UPDATE outbox_messages SET status='uncertain',error=? WHERE organization_id=? AND id=?",args:['Check delivery with your email provider before sending another message.',org,id]});
    throw error;
  }
}

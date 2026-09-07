import { rows } from './operations';

/** Read-only, bounded operational context for Serenity. Never treat pipeline as cash. */
export async function operationsBrief(org:number,today=new Date().toISOString().slice(0,10)) {
  const [requests,unassigned,visits,stock,drafts]=await Promise.all([
    rows<{id:number;name:string;service:string;priority:string}>('SELECT id,name,service,priority FROM service_requests WHERE organization_id=? AND status=\'new\' ORDER BY created_at LIMIT 10',[org]),
    rows<{id:number;title:string;scheduledStart:string|null}>("SELECT id,title,scheduled_start FROM jobs WHERE organization_id=? AND team_member_id IS NULL AND status NOT IN ('completed','cancelled') ORDER BY scheduled_start LIMIT 10",[org]),
    rows<{id:number;name:string;customerName:string;nextVisit:string}>("SELECT a.id,a.name,c.name AS customer_name,a.next_visit FROM service_agreements a JOIN customers c ON c.id=a.customer_id AND c.organization_id=a.organization_id WHERE a.organization_id=? AND a.status='active' AND a.next_visit<=? ORDER BY a.next_visit LIMIT 10",[org,today]),
    rows<{id:number;name:string;location:string;quantity:number;reorderAt:number}>('SELECT id,name,location,quantity,reorder_at FROM inventory_items WHERE organization_id=? AND quantity<=reorder_at ORDER BY quantity LIMIT 10',[org]),
    rows<{total:number}>("SELECT count(*) AS total FROM outbox_messages WHERE organization_id=? AND status='draft'",[org]),
  ]);
  return {
    note:'Request, job, plan and stock lists show at most 10 items each. These are tasks, not cash or payments. Take the owner to the linked screen to review and act.',
    newRequests:{href:'/requests',items:requests},unassignedJobs:{href:'/dispatch',items:unassigned},
    serviceVisitsDue:{href:'/agreements',items:visits},lowStock:{href:'/inventory',items:stock},
    followUpDrafts:{href:'/automations',count:drafts[0]?.total||0,approvalRequired:true},
  };
}

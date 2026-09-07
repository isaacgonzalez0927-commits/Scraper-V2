import { getClient, nowISO, token } from './db';
import { DEMO_EMAIL } from './seed';

function day(offset:number) { const date=new Date();date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10); }
function start(offset:number,hour:number) { return `${day(offset)}T${String(hour).padStart(2,'0')}:00`; }

/** One-time sample operations for Harbor Air only. Never touches a real shop. */
export async function seedOperationsDemo() {
 const client=getClient();
 const result=await client.execute({sql:'SELECT m.organization_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE lower(u.email)=lower(?) LIMIT 1',args:[DEMO_EMAIL]});
 const org=Number(result.rows[0]?.organization_id||0);if(!org)return;
 const exists=await client.execute({sql:'SELECT 1 FROM operation_seed_markers WHERE organization_id=? AND name=?',args:[org,'service-os-v1']});if(exists.rows.length)return;
 const tx=await client.transaction('write');
 try {
  const claimed=await tx.execute({sql:'SELECT 1 FROM operation_seed_markers WHERE organization_id=? AND name=?',args:[org,'service-os-v1']});
  if(claimed.rows.length){await tx.commit();return;}
  const customers=await tx.execute({sql:'SELECT id,name FROM customers WHERE organization_id=? ORDER BY id LIMIT 5',args:[org]});if(customers.rows.length<3){await tx.rollback();return;}
  const now=nowISO();
  const crew=[['Marcus Reed','(239) 555-0171','Diagnostics, EPA 608','#5b38d6',3200],['Andre Collins','(239) 555-0133','Installations, heat pumps','#18866b',3600],['Nina Patel','(239) 555-0188','Maintenance, indoor air quality','#d66a38',2900]] as const;
  const crewIds:number[]=[];for(const [name,phone,skills,color,cost] of crew){const added=await tx.execute({sql:'INSERT INTO crew_members (organization_id,name,phone,skills,color,hourly_cost_cents,created_at) VALUES (?,?,?,?,?,?,?)',args:[org,name,phone,skills,color,cost,now]});crewIds.push(Number(added.lastInsertRowid));}
  const c1=Number(customers.rows[0].id),c2=Number(customers.rows[1].id),c3=Number(customers.rows[2].id);
  await tx.execute({sql:'INSERT INTO service_requests (organization_id,name,email,phone,address,service,description,source,priority,status,preferred_date,created_at,updated_at,submission_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[org,'Lauren Miller','lauren.miller@example.com','(239) 555-0164','73 Bayberry Way, Cape Coral','AC not cooling','Warm air from the vents since last night.','website','urgent','new',day(0),now,now,token()]});
  await tx.execute({sql:'INSERT INTO service_requests (organization_id,name,email,phone,address,service,description,source,priority,status,preferred_date,created_at,updated_at,submission_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[org,'David Ross','david.ross@example.com','(239) 555-0129','3080 McGregor Blvd, Fort Myers','Maintenance plan','Interested in seasonal maintenance for two systems.','office','normal','contacted',day(4),now,now,token()]});
  await tx.execute({sql:'INSERT INTO service_agreements (organization_id,customer_id,name,amount_cents,billing_months,visit_months,next_visit,renews_on,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',args:[org,c1,'Comfort Club',2900,1,6,day(-2),day(180),'Two seasonal tune-ups and priority service.',now]});
  await tx.execute({sql:'INSERT INTO service_agreements (organization_id,customer_id,name,amount_cents,billing_months,visit_months,next_visit,renews_on,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',args:[org,c2,'Commercial Care',14900,1,3,day(18),day(270),'Quarterly rooftop unit inspection.',now]});
  await tx.execute({sql:'INSERT INTO equipment_assets (organization_id,customer_id,name,model,serial,installed_on,warranty_until,next_service,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',args:[org,c1,'Main heat pump','Carrier 24ACC6','2414X12345','2024-04-12','2034-04-12',day(-2),'16x25x1 filter · R-410A',now]});
  await tx.execute({sql:'INSERT INTO equipment_assets (organization_id,customer_id,name,model,serial,installed_on,warranty_until,next_service,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',args:[org,c2,'Rooftop unit','Trane Precedent 5-ton','RTU-110-A','2022-11-03','2027-11-03',day(18),'20x25x2 filter',now]});
  const stock=[['45/5 dual capacitor','CAP-45-5','Shop',8,3,1850],['16x25x1 filter','FLT-16251','Truck 1',2,4,640],['EZ trap float switch','EZT-210','Shop',6,2,1290],['R-410A refrigerant (lb)','R410A-LB','Shop',18,8,2450]] as const;
  for(const [name,sku,location,qty,reorder,cost] of stock)await tx.execute({sql:'INSERT INTO inventory_items (organization_id,name,sku,location,quantity,reorder_at,unit_cost_cents,created_at) VALUES (?,?,?,?,?,?,?,?)',args:[org,name,sku,location,qty,reorder,cost,now]});
  const open=await tx.execute({sql:"SELECT id FROM jobs WHERE organization_id=? AND status NOT IN ('completed','cancelled') ORDER BY id LIMIT 3",args:[org]});
  for(let index=0;index<open.rows.length;index++){const id=Number(open.rows[index].id);await tx.execute({sql:'UPDATE jobs SET team_member_id=?,technician_name=?,scheduled_start=?,duration_minutes=?,priority=? WHERE organization_id=? AND id=?',args:[crewIds[index%crewIds.length],crew[index%crew.length][0],start(index?1:0,9+index*2),index===1?120:90,index===2?'high':'normal',org,id]});if(index===0){await tx.execute({sql:'INSERT INTO job_checklist (organization_id,job_id,label,updated_at) VALUES (?,?,?,?),(?,?,?,?),(?,?,?,?)',args:[org,id,'Confirm system model and serial',now,org,id,'Photograph completed work',now,org,id,'Review thermostat operation with customer',now]});}}
  await tx.execute({sql:'INSERT INTO operations_settings (organization_id,booking_enabled,booking_intro,service_area,timezone) VALUES (?,?,?,?,?) ON CONFLICT(organization_id) DO NOTHING',args:[org,1,'Tell us what your system is doing. Harbor Air will confirm an appointment time.','Fort Myers, Cape Coral, Estero','America/New_York']});
  for(const [kind,delay] of [['invoice',3],['estimate',2],['maintenance',0]] as const)await tx.execute({sql:'INSERT INTO automation_rules (organization_id,kind,enabled,delay_days) VALUES (?,?,1,?) ON CONFLICT(organization_id,kind) DO NOTHING',args:[org,kind,delay]});
  await tx.execute({sql:'INSERT INTO operation_seed_markers (organization_id,name,created_at) VALUES (?,?,?)',args:[org,'service-os-v1',now]});
  await tx.commit();
 } catch(error){await tx.rollback();throw error;} finally{tx.close();}
}

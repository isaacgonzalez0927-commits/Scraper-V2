import { Shell } from '@/components/Shell';
import { Banner, Stat } from '@/components/ui';
import { OperationsNav } from '@/components/OperationsUI';
import { DispatchBoard } from '@/components/DispatchBoard';
import { loadApp } from '@/lib/page';
import { getCrew, getDispatchJobs } from '@/lib/operations';
import { validDate } from '@/lib/operations-validation';
export default async function DispatchPage({searchParams}:{searchParams:Promise<{date?:string;crew?:string;error?:string}>}) {
 const {org,shell}=await loadApp(),q=await searchParams;
 let date=new Date().toISOString().slice(0,10);try{date=validDate(q.date||date);}catch{}
 const [crew,jobs]=await Promise.all([getCrew(org.id),getDispatchJobs(org.id)]);
 const day=jobs.filter(j=>j.scheduledStart?.startsWith(date)&&j.status!=='cancelled');
 return <Shell {...shell} path="/dispatch" title="Dispatch" sub={<p className="page-sub">The day’s appointments, in order.</p>} actions={<><a className="btn btn-secondary" href="/calendar">Calendar view</a><a className="btn" href={`/jobs/new?start=${date}T09:00`}>+ Schedule work</a></>}><OperationsNav active="/dispatch"/><Banner error={q.error}/><div className="dispatch-workspace"><div className="grid grid-4 dispatch-summary"><Stat label="Appointments" value={String(day.length)} note="On this day’s schedule"/><Stat label="Crew on the board" value={String(new Set(day.map(j=>j.teamMemberId).filter(Boolean)).size)} note={`${crew.filter(m=>m.active).length} active crew members`}/><Stat label="Scheduled hours" value={`${Math.round(day.reduce((s,j)=>s+j.durationMinutes,0)/6)/10}h`} note="Planned service time"/><Stat label="Completed" value={String(day.filter(j=>j.status==='completed').length)} note="Work wrapped up" tone="good"/></div><form className="ops-board-controls" method="get"><label className="row">Date <input className="input" type="date" name="date" defaultValue={date} required/></label><label className="row">Crew <select className="input" name="crew" defaultValue={q.crew||''}><option value="">Everyone</option>{crew.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="btn btn-secondary btn-sm">Show schedule</button><a className="btn btn-ghost btn-sm" href="/dispatch">Today</a></form><DispatchBoard jobs={jobs} crew={crew} date={date} crewFilter={Number(q.crew)||undefined}/></div></Shell>;
}

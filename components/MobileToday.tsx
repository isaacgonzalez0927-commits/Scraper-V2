import { Icon } from "./Icon";
import { formatMoney } from "@/lib/money";

type Visit = { id:number; title:string; customer:string; address:string; crew:string; status:string; start:string|null };

function time(stamp:string|null) {
  if(!stamp)return "Unscheduled";
  const hour=Number(stamp.slice(11,13)),minutes=stamp.slice(14,16);
  return `${hour%12||12}:${minutes} ${hour>=12?"PM":"AM"}`;
}

export function MobileToday({today,greeting,visits,tomorrow,requests,unassigned,plans,stock,collected,outstanding,overdue,invoiced,profit}: {
  today:string; greeting:string; visits:Visit[]; tomorrow:Visit[];
  requests:number; unassigned:number; plans:number; stock:number;
  collected:number; outstanding:number; overdue:number; invoiced:number; profit:number;
}) {
  const ordered=[...visits].sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  const remaining=ordered.filter(visit=>visit.status!=="completed");
  const next=remaining.find(visit=>visit.status==="in_progress")||remaining[0]||[...tomorrow].sort((a,b)=>(a.start||"").localeCompare(b.start||""))[0];
  const isTomorrow=Boolean(next && next.start?.slice(0,10)!==today);
  const finished=ordered.length-remaining.length;
  const date=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${today}T12:00:00Z`));
  return <div className="mobile-today">
    <header className="mobile-day-heading"><p>{date}</p><h1>Today</h1><span>{greeting}</span></header>
    <section className="mobile-day-plan" aria-labelledby="mobile-schedule-heading">
      <div className="mobile-section-heading"><div><h2 id="mobile-schedule-heading">Your day</h2><p>{visits.length?`${finished} of ${visits.length} visits complete`:"No visits scheduled today"}</p></div><a href="/dispatch">Schedule <Icon name="chevron"/></a></div>
      {visits.length?<progress className="mobile-day-progress" value={finished} max={visits.length} aria-label={`${finished} of ${visits.length} visits complete`}/>:null}
      {next?<article className="mobile-next-visit">
        <div className="mobile-visit-top"><span className={`mobile-visit-state${next.status==="in_progress"?" is-working":""}`}>{next.status==="in_progress"?"In progress":isTomorrow?"Tomorrow":"Up next"}</span><time dateTime={next.start||undefined}>{time(next.start)}</time></div>
        <a className="mobile-visit-title" href={`/field?job=${next.id}`}><h3>{next.title}</h3><p>{next.customer}</p></a>
        {next.address?<p className="mobile-visit-address"><Icon name="pin"/>{next.address}</p>:null}
        <div className="mobile-visit-footer"><span>{next.crew||"Crew unassigned"}</span><a className="btn" href={`/field?job=${next.id}`}>Open visit <Icon name="arrow"/></a></div>
      </article>:<div className="mobile-day-empty"><Icon name="calendar"/><h3>{visits.length?"Today’s visits are complete":"Room for the next job"}</h3><a href="/dispatch">Open your schedule <Icon name="arrow"/></a></div>}
      {remaining.filter(visit=>visit.id!==next?.id).slice(0,2).map(visit=><a className="mobile-next-row" key={visit.id} href={`/field?job=${visit.id}`}><time dateTime={visit.start||undefined}>{time(visit.start)}</time><span><strong>{visit.title}</strong><small>{visit.customer}</small></span><Icon name="chevron"/></a>)}
    </section>

    <section className="mobile-attention" aria-labelledby="mobile-attention-heading"><div className="mobile-section-heading"><h2 id="mobile-attention-heading">Keep things moving</h2></div><div className="mobile-attention-grid">
      {[{href:"/requests",label:"New requests",count:requests,icon:"file"},{href:"/dispatch",label:"Need a crew",count:unassigned,icon:"users"},{href:"/agreements",label:"Plan visits due",count:plans,icon:"calendar"},{href:"/inventory",label:"Parts to reorder",count:stock,icon:"grid"}].map(item=><a href={item.href} key={item.href}><span><Icon name={item.icon}/><strong>{item.count}</strong></span><span>{item.label}</span></a>)}
    </div></section>

    <section className="mobile-money" aria-labelledby="mobile-money-heading">
      <div className="mobile-money-top"><h2 id="mobile-money-heading">Collected this month</h2><Icon name="cash"/></div>
      <strong className="mobile-money-total">{formatMoney(collected)}</strong><p className="mobile-money-caption">Recorded payments</p>
      <div className="mobile-money-balances"><a href="/collect"><span>Outstanding</span><strong>{formatMoney(outstanding)}</strong></a><a href="/invoices?status=overdue"><span>Past due</span><strong>{formatMoney(overdue)}</strong></a></div>
      <a className="mobile-money-link" href="/collect">Open Collect <Icon name="arrow"/></a>
    </section>
    <details className="mobile-month-details"><summary>Monthly details <Icon name="chevron"/></summary><dl><div><dt>Invoiced</dt><dd>{formatMoney(invoiced)}</dd></div><div><dt>Estimated profit</dt><dd>{formatMoney(profit)}</dd></div></dl><p>Invoiced is billed work. Estimated profit is revenue less costs; it may include work still in progress.</p></details>
  </div>;
}

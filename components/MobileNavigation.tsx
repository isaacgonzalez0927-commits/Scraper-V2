"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "./Icon";

type MenuItem = { href: string; label: string; icon: string; count?: string };
const tabs = [
  { href: "/overview", label: "Today", icon: "grid", routes: ["overview"] },
  { href: "/dispatch", label: "Work", icon: "briefcase", routes: ["dispatch", "field", "jobs", "requests", "estimates", "calendar"] },
  { href: "/collect", label: "Collect", icon: "cash", routes: ["collect", "invoices", "payments"] },
  { href: "/serenity", label: "Serenity", icon: "spark", routes: ["serenity"] },
];
const create: MenuItem[] = [
  { href: "/requests?new=1", label: "Service request", icon: "file" },
  { href: "/jobs/new", label: "Job", icon: "briefcase" },
  { href: "/customers/new", label: "Customer", icon: "users" },
  { href: "/estimates/new", label: "Estimate", icon: "file" },
  { href: "/invoices/new", label: "Invoice", icon: "card" },
];

export function MobileNavigation({path,orgName,userName,unread,collectCount,frozen,groups,account}: {
  path:string; orgName:string; userName:string; unread:number; collectCount:number; frozen?:boolean;
  groups:{name:string;items:MenuItem[]}[]; account:ReactNode;
}) {
  const [panel,setPanel]=useState<"more"|"create"|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLElement|null>(null);
  const route=path.split("/")[1];
  const moreActive=!tabs.some(tab=>tab.routes.includes(route));

  useEffect(()=>{
    if(!panel)return;
    const sheet=dialog.current;
    const overflow=document.body.style.overflow;
    if(sheet && !sheet.open)sheet.showModal();
    document.body.style.overflow="hidden";
    const desktop=window.matchMedia("(min-width: 901px)");
    const resize=()=>{if(desktop.matches)setPanel(null);};
    desktop.addEventListener("change",resize);
    return ()=>{
      desktop.removeEventListener("change",resize);
      document.body.style.overflow=overflow;
      sheet?.close();
      trigger.current?.focus();
    };
  },[panel]);

  function open(next:"more"|"create",button:HTMLElement) {trigger.current=button;setPanel(next);}
  function menuLink(item:MenuItem) {
    const active=path===item.href || path.startsWith(`${item.href}/`);
    return <a key={item.href} href={item.href} className={active?"active":""} aria-current={active?"page":undefined} onClick={()=>setPanel(null)}>
      <span className="mobile-menu-icon"><Icon name={item.icon}/></span><span>{item.label}</span>
      {item.count?<span className="mobile-menu-count">{item.count}</span>:<Icon name="chevron" className="mobile-chevron"/>}
    </a>;
  }

  return <div className="mobile-navigation">
    <header className="mobile-header">
      <a href="/overview" className="mobile-brand" aria-label={`${orgName} — Today`}><BrandLogo className="brand-lockup"/><span>{orgName}</span></a>
      <div className="mobile-header-actions">
        <button className="mobile-icon-button" type="button" data-open-search aria-label="Search customers, jobs and invoices"><Icon name="search"/></button>
        <a className="mobile-icon-button" href="/notifications" aria-label={`Notifications${unread?`, ${unread} unread`:""}`}><Icon name="bell"/>{unread>0?<span className="mobile-unread">{unread>9?"9+":unread}</span>:null}</a>
        {!frozen?<button className="mobile-create" type="button" onClick={event=>open("create",event.currentTarget)} aria-label="Create a request, job, customer, estimate or invoice" aria-haspopup="dialog" aria-controls="mobile-menu" aria-expanded={panel==="create"}><Icon name="plus"/></button>:null}
      </div>
    </header>

    <nav className="mobile-tabbar" aria-label="Primary navigation">
      {tabs.map(tab=>{
        const active=tab.routes.includes(route);
        return <a key={tab.href} href={tab.href} className={active?"active":""} aria-current={active?"page":undefined}>
          <span className="mobile-tab-icon"><Icon name={tab.icon} filled={active}/>{tab.label==="Collect" && collectCount>0?<span className="mobile-unread">{collectCount>9?"9+":collectCount}</span>:null}</span>
          <span>{tab.label}</span>
        </a>;
      })}
      <button type="button" className={panel==="more"||moreActive?"active":""} onClick={event=>open("more",event.currentTarget)} aria-label="More pages and account" aria-haspopup="dialog" aria-controls="mobile-menu" aria-expanded={panel==="more"}><span className="mobile-tab-icon"><Icon name="more"/></span><span>More</span></button>
    </nav>

    <dialog ref={dialog} id="mobile-menu" className="mobile-sheet" aria-labelledby="mobile-menu-title" onCancel={()=>setPanel(null)} onClick={event=>{if(event.target===event.currentTarget)setPanel(null);}}>
      <div className="mobile-sheet-body">
        <div className="mobile-sheet-head"><div><p>{panel==="create"?"ADD TO YOUR BUSINESS":orgName}</p><h2 id="mobile-menu-title">{panel==="create"?"Create something new":"Your business"}</h2></div><button className="mobile-icon-button" type="button" onClick={()=>setPanel(null)} aria-label="Close menu" autoFocus><Icon name="close"/></button></div>
        {panel==="create"?<nav className="mobile-menu-group" aria-label="Create a record">{create.map(menuLink)}</nav>:<>
          <a className="mobile-customer-shortcut" href="/customers" onClick={()=>setPanel(null)}><Icon name="users"/><span><strong>Customers</strong><small>Contacts, properties and history</small></span><Icon name="chevron"/></a>
          {groups.map(group=><nav className="mobile-menu-group" key={group.name} aria-label={group.name}><h3>{group.name}</h3>{group.items.map(menuLink)}</nav>)}
          <footer className="mobile-account"><p>Signed in as <strong>{userName}</strong></p><div>{account}</div></footer>
        </>}
      </div>
    </dialog>
  </div>;
}

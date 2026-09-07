import type { InputHTMLAttributes, ReactNode } from 'react';

const daily=[['/requests','Requests'],['/dispatch','Dispatch'],['/field','Field work']];
const business=[['/team','Team'],['/agreements','Service plans'],['/equipment','Equipment'],['/inventory','Inventory'],['/automations','Follow-ups']];
export function OperationsNav({active}:{active:string}) {
  const sections=daily.some(([href])=>href===active)?daily:business;
  return <nav className="ops-tabs" aria-label="Service operations">{sections.map(([href,name])=><a key={href} href={href} aria-current={href===active?'page':undefined} className={href===active?'active':''}>{name}</a>)}</nav>;
}
export function Field({label,name,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string;name:string}) {
  return <label className="field ops-input-label"><span>{label}</span><input name={name} {...props}/></label>;
}
export function SelectField({label,name,children,defaultValue,required}:{label:string;name:string;children:ReactNode;defaultValue?:string|number;required?:boolean}) {
  return <label className="field ops-input-label"><span>{label}</span><select name={name} defaultValue={defaultValue} required={required}>{children}</select></label>;
}
export function TextField({label,name,defaultValue,placeholder}:{label:string;name:string;defaultValue?:string;placeholder?:string}) {
  return <label className="field full ops-input-label"><span>{label}</span><textarea name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={4000} rows={3}/></label>;
}
export function FormPanel({title,children,open=false}:{title:string;children:ReactNode;open?:boolean}) {
  return <details className="ops-form-panel" open={open}><summary><span className="ops-plus" aria-hidden="true">+</span>{title}<span className="muted">Open form</span></summary><div className="ops-form-body">{children}</div></details>;
}
export function Avatar({name,color}:{name:string;color?:string}) {
  return <span className="ops-avatar" style={color?{background:color,color:'#fff'}:undefined} aria-hidden="true">{name.split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()}</span>;
}
export function Pill({children,tone='neutral'}:{children:ReactNode;tone?:string}) {
  return <span className={`ops-pill ops-pill-${tone}`}>{children}</span>;
}
export function OpsEmpty({title,body}:{title:string;body:string}) {
  return <div className="ops-empty"><span className="ops-empty-symbol" aria-hidden="true">↗</span><h3>{title}</h3><p>{body}</p></div>;
}
export function Submit({children='Save'}:{children?:ReactNode}) {return <div className="form-actions"><button className="btn" type="submit">{children}</button></div>;}

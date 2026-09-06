import type { InputHTMLAttributes, ReactNode } from 'react';

const sections=[['/requests','Requests'],['/dispatch','Dispatch'],['/field','Field work'],['/team','Team'],['/agreements','Service plans'],['/equipment','Equipment'],['/inventory','Inventory'],['/automations','Follow-ups']];
export function OperationsNav({active}:{active:string}) {
  return <nav className="ops-tabs" aria-label="Service operations">{sections.map(([href,name])=><a key={href} href={href} aria-current={href===active?'page':undefined} className={href===active?'active':''}>{name}</a>)}</nav>;
}
export function Field({label,name,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string;name:string}) {
  return <div className="field"><label htmlFor={`ops-${name}`}>{label}</label><input id={`ops-${name}`} name={name} {...props}/></div>;
}
export function SelectField({label,name,children,defaultValue,required}:{label:string;name:string;children:ReactNode;defaultValue?:string|number;required?:boolean}) {
  return <div className="field"><label htmlFor={`ops-${name}`}>{label}</label><select id={`ops-${name}`} name={name} defaultValue={defaultValue} required={required}>{children}</select></div>;
}
export function TextField({label,name,defaultValue,placeholder}:{label:string;name:string;defaultValue?:string;placeholder?:string}) {
  return <div className="field full"><label htmlFor={`ops-${name}`}>{label}</label><textarea id={`ops-${name}`} name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={4000} rows={3}/></div>;
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

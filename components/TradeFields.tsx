import type { Details, TradeField } from "@/lib/business";

export function TradeFields({
  fields,
  values,
  title,
  note,
}: {
  fields: readonly TradeField[];
  values?: Details;
  title: string;
  note?: string;
}) {
  if (!fields.length) return null;
  return (
    <section className="card form-grid">
      <div className="field full">
        <h2 className="card-title">{title}</h2>
        {note ? <p className="card-note">{note}</p> : null}
      </div>
      {fields.map((item) => (
        <div className="field" key={item.key}>
          <label>{item.label}</label>
          <input
            name={`detail_${item.key}`}
            defaultValue={values?.[item.key] || ""}
            placeholder={item.placeholder || ""}
          />
          {item.help ? <p className="help">{item.help}</p> : null}
        </div>
      ))}
    </section>
  );
}

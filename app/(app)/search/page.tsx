import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";
import { searchOrg } from "@/lib/queries";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { org, shell } = await loadApp();
  const { q } = await searchParams;
  const term = (q || "").trim();
  const results = term.length >= 2 ? await searchOrg(org.id, term) : { customers: [], jobs: [], invoices: [] };

  return (
    <Shell {...shell} path="/search" title="Search">
      <form className="filters" method="get">
        <input
          name="q"
          defaultValue={term}
          placeholder="Name, phone, invoice number, address"
          style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "7px 12px", minWidth: 280 }}
        />
        <button className="btn btn-secondary btn-sm" type="submit">Search</button>
      </form>
      {!term ? <p className="muted">Type at least two characters.</p> : null}
      {(["customers", "jobs", "invoices"] as const).map((group) => (
        <section className="card" key={group} style={{ marginBottom: 14 }}>
          <div className="card-title">{group}</div>
          {results[group].length ? results[group].map((item) => (
            <p key={item.href}>
              <a href={item.href}>{item.label}</a>
              <span className="tiny"> {item.meta}</span>
            </p>
          )) : <p className="muted">No matches</p>}
        </section>
      ))}
    </Shell>
  );
}

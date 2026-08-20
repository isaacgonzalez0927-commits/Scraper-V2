import { Card, SearchField } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";
import { searchOrg } from "@/lib/queries";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { q } = await searchParams;
  const term = (q || "").trim();
  const results = term.length >= 2 ? await searchOrg(org.id, term) : { customers: [], jobs: [], invoices: [] };
  const groups = [
    { key: "customers" as const, name: voice.customers },
    { key: "jobs" as const, name: voice.jobs },
    { key: "invoices" as const, name: "Invoices" },
  ];
  const total = groups.reduce((sum, g) => sum + results[g.key].length, 0);

  return (
    <Shell
      {...shell}
      path="/search"
      title="Search"
      sub={
        <p className="page-sub">
          {term ? `${total} matches for "${term}"` : "Names, phone numbers, addresses, and invoice numbers."}
        </p>
      }
    >
      <div className="toolbar">
        <SearchField value={term} placeholder="Name, phone, invoice number, address" />
      </div>
      {!term ? <p className="muted">Type at least two characters.</p> : null}
      <div className="grid grid-3">
        {groups.map((group) => (
          <Card key={group.key} title={group.name} note={`${results[group.key].length} found`}>
            {results[group.key].length ? (
              <ul className="list">
                {results[group.key].map((item) => (
                  <li key={item.href}>
                    <div>
                      <a className="rowlink" href={item.href}>{item.label}</a>
                      <div className="tiny">{item.meta}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No matches.</p>
            )}
          </Card>
        ))}
      </div>
    </Shell>
  );
}

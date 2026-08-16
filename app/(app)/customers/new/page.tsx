import { CustomerForm } from "@/components/CustomerForm";
import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { shell } = await loadApp();
  const q = await searchParams;
  return (
    <Shell
      {...shell}
      path="/customers"
      title="New customer"
      sub={<p className="page-sub">A name is all that is required. The rest can wait.</p>}
      actions={<a className="btn btn-secondary" href="/customers">Cancel</a>}
    >
      <CustomerForm error={q.error} />
    </Shell>
  );
}

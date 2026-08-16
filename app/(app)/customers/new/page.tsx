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
    <Shell {...shell} path="/customers" title="New customer">
      <CustomerForm error={q.error} />
    </Shell>
  );
}

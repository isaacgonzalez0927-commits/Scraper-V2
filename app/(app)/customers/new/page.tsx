import { CustomerForm } from "@/components/CustomerForm";
import { Shell } from "@/components/Shell";
import { tradeFieldsFor } from "@/lib/business";
import { loadApp } from "@/lib/page";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const q = await searchParams;
  return (
    <Shell
      {...shell}
      path="/customers"
      title={voice.newCustomer}
      sub={<p className="page-sub">{voice.newCustomerSub}</p>}
      actions={<a className="btn btn-secondary" href="/customers">Cancel</a>}
    >
      <CustomerForm
        error={q.error}
        voice={voice}
        fields={tradeFieldsFor(org.businessType, "customer")}
      />
    </Shell>
  );
}

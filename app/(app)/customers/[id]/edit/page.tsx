import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/CustomerForm";
import { Shell } from "@/components/Shell";
import { tradeFieldsFor } from "@/lib/business";
import { db } from "@/lib/db";
import { loadApp } from "@/lib/page";
import { customers } from "@/lib/schema";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { org, shell, voice } = await loadApp();
  const { id } = await params;
  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, Number(id)), eq(customers.organizationId, org.id)));
  if (!customer) notFound();
  return (
    <Shell
      {...shell}
      path="/customers"
      title={`Edit ${customer.name}`}
      actions={<a className="btn btn-secondary" href={`/customers/${customer.id}`}>Cancel</a>}
    >
      <CustomerForm
        customer={customer}
        voice={voice}
        fields={tradeFieldsFor(org.businessType, "customer")}
      />
    </Shell>
  );
}

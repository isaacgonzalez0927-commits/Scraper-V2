"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, nowISO } from "@/lib/db";
import { addEstimateEvent, canCustomerRespond } from "@/lib/estimates";
import { notify } from "@/lib/finance";
import { estimates } from "@/lib/schema";

async function respondToEstimate(form: FormData, response: "approved" | "declined") {
  const publicToken = String(form.get("token") || "").trim();
  if (!publicToken) redirect("/");
  const [estimate] = await db().select().from(estimates).where(eq(estimates.publicToken, publicToken));
  if (!estimate) redirect("/");

  if (estimate.status === response) {
    redirect(`/p/est/${publicToken}?ok=${response}`);
  }
  if (!canCustomerRespond(estimate.status)) {
    redirect(`/p/est/${publicToken}?error=${encodeURIComponent("This estimate can no longer be changed.")}`);
  }

  const now = nowISO();
  const updated = await db()
    .update(estimates)
    .set({
      status: response,
      approvedAt: response === "approved" ? now : null,
      declinedAt: response === "declined" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(estimates.id, estimate.id),
        eq(estimates.organizationId, estimate.organizationId),
        inArray(estimates.status, ["sent", "viewed"]),
      ),
    )
    .returning({ id: estimates.id });
  if (!updated.length) {
    redirect(`/p/est/${publicToken}?error=${encodeURIComponent("This estimate was already answered.")}`);
  }

  const verb = response === "approved" ? "approved" : "declined";
  await addEstimateEvent(estimate.organizationId, estimate.id, verb, `Customer ${verb} the estimate`);
  await notify(
    estimate.organizationId,
    `estimate_${verb}`,
    `${estimate.number} was ${verb}`,
    "",
    `/estimates/${estimate.id}`,
  );
  redirect(`/p/est/${publicToken}?ok=${response}`);
}

export async function approveEstimateAction(form: FormData) {
  await respondToEstimate(form, "approved");
}

export async function declineEstimateAction(form: FormData) {
  await respondToEstimate(form, "declined");
}

"use server";

import { startPrimaryCheckout } from "@/lib/checkout";

export async function startInvoiceCheckoutAction(form: FormData) {
  await startPrimaryCheckout(String(form.get("token") || "").trim());
}

export async function startSquareCheckoutAction(form: FormData) {
  await startPrimaryCheckout(String(form.get("token") || "").trim());
}

export async function startPaypalCheckoutAction(form: FormData) {
  await startPrimaryCheckout(String(form.get("token") || "").trim());
}

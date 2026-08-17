import { headers } from "next/headers";
import { publicBaseUrl } from "./display";

/**
 * The origin customers see. SERE_PUBLIC_BASE_URL wins because that is the
 * custom domain; otherwise fall back to the host the request arrived on so
 * links work on preview deployments and on localhost.
 */
export async function absoluteBaseUrl(): Promise<string> {
  const configured = publicBaseUrl();
  if (configured) return configured;
  const list = await headers();
  const host = list.get("x-forwarded-host") || list.get("host");
  if (!host) return "";
  const proto = list.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

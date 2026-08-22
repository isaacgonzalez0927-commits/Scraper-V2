import { redirect } from "next/navigation";
import { SERENITY_PATH } from "@/lib/serenity";

export const dynamic = "force-dynamic";

export default function NovaRedirectPage() {
  redirect(SERENITY_PATH);
}

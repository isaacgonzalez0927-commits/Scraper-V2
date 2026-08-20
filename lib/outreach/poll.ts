/**
 * Pulling outcomes back in without a human typing them.
 *
 * Bounces and spam complaints are the two signals that decide whether sending
 * can continue, so they cannot depend on someone remembering to record them.
 * Resend exposes the last delivery event per message, so this polls the ids we
 * stored at send time and writes what it finds.
 *
 * Replies are deliberately not here. A reply lands in a mailbox, not in the
 * sending API, so it needs an inbox connection (IMAP or an inbound provider).
 * Until that exists, replies and signups are recorded by hand — and those are
 * the good outcomes, so the autonomous path never depends on them.
 */

export type DeliveryEvent = "delivered" | "bounced" | "complained" | "pending" | "unknown";

export function mapLastEvent(lastEvent: string): DeliveryEvent {
  const event = lastEvent.trim().toLowerCase();
  if (event === "bounced" || event === "bounce") return "bounced";
  if (event === "complained" || event === "complaint") return "complained";
  if (event === "delivered") return "delivered";
  if (event === "sent" || event === "queued" || event === "scheduled") return "pending";
  if (event === "delivery_delayed") return "pending";
  // Engagement events mean it got there.
  if (event === "opened" || event === "clicked") return "delivered";
  return "unknown";
}

export class PollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollError";
  }
}

/** One message's current state, by the provider id stored at send time. */
export async function fetchDeliveryEvent(
  apiKey: string,
  providerId: string,
): Promise<DeliveryEvent> {
  if (!providerId) return "unknown";
  let response: Response;
  try {
    response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PollError(`Could not reach the email provider: ${(error as Error).message}`);
  }
  if (response.status === 404) return "unknown";
  const payload = (await response.json().catch(() => ({}))) as {
    last_event?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new PollError(payload.message || `Email provider returned ${response.status}.`);
  }
  return mapLastEvent(String(payload.last_event || ""));
}

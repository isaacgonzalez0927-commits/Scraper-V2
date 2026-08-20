export type Prospect = {
  id: number;
  company: string;
  contact: string;
  email: string;
  trade: string;
  city: string;
  website: string;
  /**
   * The one true, specific thing we know about this shop. Without it Nova has
   * nothing to say and writes "I hope this finds you well."
   */
  fact: string;
  source: string;
  unsubscribedAt: string | null;
  createdAt: string;
};

export type Draft = {
  subject: string;
  body: string;
};

/** What actually happened after we hit send. This is the training signal. */
export type Outcome = {
  sentAt: string | null;
  openedDemoAt: string | null;
  repliedAt: string | null;
  signedUpAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
};

export type OutreachEmail = Draft &
  Outcome & {
    id: number;
    prospectId: number;
    product: string;
    variant: string;
    approvedAt: string | null;
    providerId: string;
    createdAt: string;
  };

/** An email plus the prospect it went to, which is what retrieval needs. */
export type SentEmail = OutreachEmail & {
  trade: string;
  city: string;
  fact: string;
};

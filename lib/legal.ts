/**
 * Public legal copy for sere.cash.
 *
 * This is an operator draft, not a substitute for licensed counsel in your
 * state. It is written to stay conservative: Sere is a shop book, not a bank,
 * not a card processor, and not a tax or law firm. Minors may use the product
 * with a parent or guardian. There is no forced arbitration and no class-action
 * waiver.
 */

export const LEGAL_OPERATOR = "the operator of sere.cash";
export const LEGAL_PRODUCT = "Sere";
export const LEGAL_SITE = "https://www.sere.cash";
export const LEGAL_EFFECTIVE = "August 22, 2026";
export const LEGAL_GOVERNING_STATE = "Florida";

export const TERMS_SECTIONS: { id: string; title: string; body: string[] }[] = [
  {
    id: "what",
    title: "What Sere is",
    body: [
      "Sere is shop software. It stores jobs, customers, invoices, and payments you enter, and it can read cash from Stripe or Square when you connect those accounts.",
      "Sere is not a bank, money transmitter, payment processor, payroll service, accountant, or law firm. Card charges, payouts, refunds, and disputes happen at Stripe, Square, or another processor you choose. Their rules apply to that money.",
      "Sere does not give tax, legal, or accounting advice. Numbers on the screen are a book of what you and your processors reported. You remain responsible for your books, invoices, taxes, licenses, and what you tell customers.",
    ],
  },
  {
    id: "who",
    title: "Who may use Sere",
    body: [
      "You may open a shop if you can form a binding contract where you live, or if a parent or legal guardian agrees to these Terms for you and is responsible for the account.",
      "Sere is for running a shop. It is not directed at children under 13, and we do not knowingly collect personal information from children under 13.",
      "When paid billing starts, the person who authorizes the charge must be allowed to make that payment. A free trial does not require a card today.",
      "If you use Sere for a business, you confirm you are allowed to bind that business to these Terms.",
    ],
  },
  {
    id: "account",
    title: "Your account",
    body: [
      "Keep your password to yourself. You are responsible for activity on your shop unless you tell us the account was taken and we can cut it off.",
      "Give us a working email. Notices we send there count as given.",
      "Do not share one login across people you do not trust. Crew seats, when offered, are the way to add staff.",
    ],
  },
  {
    id: "modes",
    title: "Sandbox, Desk mode, and Live",
    body: [
      "New shops start in Sandbox, like Stripe test mode. Sandbox is for practice. Connect only test keys (for example rk_test_ or a Square sandbox token). Do not take real cards through Sere while you are in Sandbox.",
      "The customers, jobs, and invoices you add in Sandbox stay in the same shop when you leave Sandbox. Sere does not keep a separate test ledger.",
      "At the end of setup you choose Live or Desk mode. Live means you connect Stripe or Square so Overview can show cash that actually landed. Desk mode is still a live shop: real customers and real invoices. It has no payment integration. You type payments in. Overview will not show processor balances. Desk mode is less useful until you connect.",
      "Connecting a live restricted key or a production Square token moves the shop to Live. You can connect later from Settings.",
    ],
  },
  {
    id: "processors",
    title: "Stripe, Square, and other connections",
    body: [
      "You connect processors with credentials you create in their dashboards. For Stripe, Sere only accepts restricted keys (rk_test_ or rk_live_). Full secret keys (sk_) can move money and change payouts. Do not paste those into Sere or any other app.",
      "You decide the permissions on a restricted key. A key that cannot read balance, charges, and payouts cannot show live cash. A key that cannot write customers or invoices cannot sync those records.",
      "Sere stores connected secrets encrypted. We do not show them back to you. We use them only to provide the features you turned on.",
      "Stripe, Square, PayPal, Intuit, OpenAI, Resend, and other third parties have their own terms and privacy policies. You must follow those as well. We are not those companies and we do not control their outages, fees, holds, or account closures.",
      "You do not paste an OpenAI key. Serenity and the shop assistant run on our key, within the monthly credit described below.",
      "Sere never takes custody of customer card numbers for checkout. Hosted checkout, if you turn it on, runs at the processor.",
    ],
  },
  {
    id: "data",
    title: "Your shop data",
    body: [
      "You own the customer, job, invoice, and payment records you put in Sere. You license us to host them, back them up, and process them so the product works.",
      "You must have the right to store the personal information you enter, including customer names, phones, emails, and addresses.",
      "Export and deletion: you may ask us to export or delete a shop. Deletion is permanent after we finish the request, except copies we must keep for security, disputes, or law, and backups that expire on their normal cycle.",
      "The Privacy Policy explains what we collect and who we share it with.",
    ],
  },
  {
    id: "assistant",
    title: "Serenity and the assistant",
    body: [
      "Serenity and the shop assistant run on our OpenAI account. You do not paste your own OpenAI key.",
      "Serenity helps you run this shop: the board, the books, jobs, and invoices. She does not do cold outreach or sell Sere to other businesses. That operator tool is separate and is not part of your shop.",
      "Each shop gets a monthly credit of $3.00 of model use. When the credit is used up, those features pause until the next month. We may change the credit amount.",
      "Questions you ask and the shop facts needed to answer them go to OpenAI under our contract with them. Do not paste secrets you would not send to a model.",
    ],
  },
  {
    id: "use",
    title: "Acceptable use",
    body: [
      "Use Sere only for lawful shop operations. Do not use it to commit fraud, launder money, abuse people, send spam, or break export, sanctions, or consumer-protection law.",
      "Do not probe, scrape, or overload the service. Do not reverse engineer except where a statute says you may.",
      "Do not upload malware or content you do not have the right to store.",
      "We may suspend a shop that we reasonably believe is harming the service, other users, or a third party, or that is using Sere for crime. We will say why when the law lets us.",
    ],
  },
  {
    id: "fees",
    title: "Trial, plans, and processor fees",
    body: [
      "New shops get a 14-day trial of the book. After that the shop may freeze until a plan is paid. We will say so in the product before we take a card.",
      "Plan prices shown in the product are for Sere. Card fees, Square fees, and payout timing stay with your processor.",
      "If we charge you in error, tell us and we will correct it. Chargebacks on a valid Sere fee may result in a frozen shop until resolved.",
    ],
  },
  {
    id: "warranty",
    title: "No warranty",
    body: [
      "Sere is provided as is and as available. We do not promise it will be error-free, uninterrupted, or fit for a particular job.",
      "To the fullest extent allowed by law, we disclaim implied warranties of merchantability, fitness for a particular purpose, and non-infringement. Some places do not allow those disclaimers. In those places, the disclaimer applies only as far as the law allows, and your statutory rights stay intact.",
    ],
  },
  {
    id: "liability",
    title: "Limit of liability",
    body: [
      "To the fullest extent allowed by law, Sere and its operator are not liable for lost profits, lost data, lost business, processor holds, tax assessments, or indirect, incidental, special, or consequential damages.",
      "Our total liability for all claims about Sere is limited to the fees you paid us for Sere in the 12 months before the claim, or fifty U.S. dollars if you paid nothing.",
      "These limits do not apply to death or personal injury caused by our negligence, to fraud, or to any liability the law says we cannot cap. They do not limit your rights as a consumer where those rights cannot be waived.",
    ],
  },
  {
    id: "indemnity",
    title: "Your responsibility to others",
    body: [
      "You will cover us for claims that come from your shop data, your invoices, your misuse of Sere, or your violation of these Terms or the law, including reasonable legal fees, except to the extent we caused the claim.",
    ],
  },
  {
    id: "term",
    title: "How this ends",
    body: [
      "You may stop using Sere and ask us to delete the shop. We may stop offering Sere or close an account for the reasons in Acceptable use, or if we shut the product down. We will give reasonable notice when we can.",
      "Sections that should survive (including Your shop data, No warranty, Limit of liability, and Governing law) survive.",
    ],
  },
  {
    id: "changes",
    title: "Changes",
    body: [
      "We may update these Terms. The effective date at the top will change. For a material change we will notice the shop email or show a notice in the product. Continued use after that is acceptance. If you do not agree, stop using Sere and ask us to delete the shop.",
    ],
  },
  {
    id: "law",
    title: "Governing law",
    body: [
      "These Terms are governed by the laws of the State of Florida, without regard to conflict-of-law rules, except that if you are a consumer who lives somewhere that does not allow that choice, the mandatory law of your home applies to those protected rights.",
      "If we ever have a dispute we cannot solve by email, the courts in Florida have jurisdiction, except where a consumer-protection statute requires the courts of your home.",
      "There is no arbitration clause and no class-action waiver in these Terms. If a court finds a part unenforceable, the rest stays.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      "Questions about these Terms: use the contact path on sere.cash or the email on your shop account notice. We operate Sere from the United States.",
    ],
  },
];

export const PRIVACY_SECTIONS: { id: string; title: string; body: string[] }[] = [
  {
    id: "collect",
    title: "What we collect",
    body: [
      "Account: name, email, password hash, shop name, and the trade you pick.",
      "Shop book: customers, jobs, invoices, payments, notes, and the optional fields your trade uses.",
      "Connections you paste: restricted Stripe keys, Square tokens, email keys, and similar secrets. Those are encrypted at rest. We do not store full Stripe secret keys, and the product rejects them.",
      "Technical: IP address, device, and basic logs needed to run and secure the site. Session cookies keep you signed in.",
      "We do not ask for Social Security numbers, and we do not take raw card numbers onto Sere servers for checkout.",
    ],
  },
  {
    id: "use",
    title: "How we use it",
    body: [
      "To run your shop book, show cash from a processor you connected, send invoices you ask us to send, and operate Serenity and the assistant within your monthly credit.",
      "To keep the service up, fix bugs, prevent abuse, and meet the law.",
      "We do not sell your shop data. We do not use your customer list to market our own product to those customers.",
    ],
  },
  {
    id: "share",
    title: "Who else sees it",
    body: [
      "Processors you connect (Stripe, Square, PayPal, Intuit) receive only what that connection needs.",
      "Email (Resend or similar) receives invoice and reset mail you trigger.",
      "Questions you ask Serenity or the assistant, and the shop facts needed to answer them, go to OpenAI under our key and within your monthly credit.",
      "Hosting and database providers (for example Vercel and Turso) store the application and data under our contract with them.",
      "We share data if the law requires it, or to protect a person from serious harm. We will narrow that request when we can.",
    ],
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: [
      "We keep a shop while the account is open. After you ask us to delete it, we remove live copies, then backups age out on their cycle.",
      "We may keep a minimal record of the deletion, invoices we were legally required to retain, or a fraud/security log.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    body: [
      "You can access and update shop records in the product. You can ask for an export or deletion of the shop.",
      "If you are in a place with extra privacy rights (including some U.S. states and the EEA/UK), you can ask us to honor access, correction, deletion, and portability as those laws require. We will not discriminate against you for asking.",
      "We do not sell personal information as that word is used in the CCPA/CPRA, and we do not share it for cross-context behavioral advertising.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    body: [
      "Sere uses a session cookie to keep you signed in and a local preference for light or dark appearance. We do not run advertising cookies.",
    ],
  },
  {
    id: "kids",
    title: "Children",
    body: [
      "Sere is not directed at children under 13. If we learn we collected personal information from a child under 13, we will delete it. A shop owner who is a minor should use Sere with a parent or guardian as described in the Terms.",
    ],
  },
  {
    id: "changes",
    title: "Changes",
    body: [
      "If we change this policy in a material way, we will update the effective date and notice the shop email or the product.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      "Privacy questions: use the contact path on sere.cash. We operate in the United States. If a later version names a formal privacy contact or an EU representative, that name controls.",
    ],
  },
];

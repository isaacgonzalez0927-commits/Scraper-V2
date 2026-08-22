import { advanceSetupAction, connectStripeAction, saveCustomerAction, saveJobAction } from "@/app/actions";
import { StripeKeyTutorial } from "@/components/StripeKeyTutorial";
import { Banner } from "@/components/ui";
import type { TradeProfile } from "@/lib/business";
import {
  nextSetupStep,
  parseSetupIntent,
  prevSetupStep,
  setupCopy,
  setupHref,
  setupPurposeChoices,
  setupRail,
  setupStepIndex,
  type SereSetupIntent,
  type SereSetupStepId,
} from "@/lib/sere-setup";

export function SereSetupWizard({
  step,
  intent,
  voice,
  error,
  ok,
  customerId,
  customerName,
  jobTitle,
}: {
  step: SereSetupStepId;
  intent?: string;
  voice: TradeProfile;
  error?: string;
  ok?: string;
  customerId?: number;
  customerName?: string;
  jobTitle?: string;
}) {
  const chosen = parseSetupIntent(intent);
  const copy = setupCopy(step, voice);
  const rail = setupRail(voice, chosen);
  const current = setupStepIndex(step, chosen);
  return (
    <div className="setup-wizard">
      <ol className="setup-progress" aria-label="Setup steps">
        {rail.map((item, index) => {
          const state = index < current ? "done" : index === current ? "current" : "";
          return (
            <li key={item.id} className={state}>
              <span className="setup-progress-index">{index + 1}</span>
              <span className="setup-progress-label">{item.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="setup-count">
        Step {current + 1} of {rail.length}
      </p>
      <h1 className="auth-title">{copy.title}</h1>
      <p className="auth-sub">{copy.sub}</p>
      <Banner error={error} ok={ok} />
      {step === "purpose" ? <PurposePane voice={voice} intent={chosen} /> : null}
      {step === "customer" ? <CustomerPane intent={chosen} /> : null}
      {step === "job" ? (
        <JobPane voice={voice} intent={chosen} customerId={customerId} customerName={customerName} />
      ) : null}
      {step === "cash" ? <CashPane intent={chosen} /> : null}
      {step === "done" ? (
        <DonePane voice={voice} customerName={customerName} jobTitle={jobTitle} />
      ) : null}
    </div>
  );
}

function PurposePane({
  voice,
  intent,
}: {
  voice: TradeProfile;
  intent: SereSetupIntent;
}) {
  return (
    <form action={advanceSetupAction} className="setup-pane">
      <input type="hidden" name="from" value="purpose" />
      <div className="setup-choices" role="radiogroup" aria-label="How will you use Sere?">
        {setupPurposeChoices(voice).map((choice) => (
          <label key={choice.value} className="setup-choice">
            <input
              type="radio"
              name="intent"
              value={choice.value}
              required
              defaultChecked={choice.value === intent}
            />
            <span>
              <strong>{choice.title}</strong>
              <span>{choice.body}</span>
            </span>
          </label>
        ))}
      </div>
      <WizardActions continueLabel="Continue" />
    </form>
  );
}

function CustomerPane({
  intent,
}: {
  intent: SereSetupIntent;
}) {
  return (
    <form action={saveCustomerAction} className="setup-pane stack">
      <input type="hidden" name="setup" value="1" />
      <input type="hidden" name="intent" value={intent} />
      <label>
        Name
        <input name="name" required autoComplete="name" enterKeyHint="next" />
      </label>
      <label>
        Phone
        <input name="phone" inputMode="tel" autoComplete="tel" enterKeyHint="next" />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" enterKeyHint="go" />
      </label>
      <WizardActions
        back={setupHref("purpose", intent)}
        skip={setupHref(nextSetupStep("job", intent), intent)}
        skipLabel="Skip for now"
        continueLabel="Continue"
      />
    </form>
  );
}

function JobPane({
  voice,
  intent,
  customerId,
  customerName,
}: {
  voice: TradeProfile;
  intent: SereSetupIntent;
  customerId?: number;
  customerName?: string;
}) {
  if (!customerId) {
    return (
      <div className="setup-pane">
        <p className="auth-fine">
          Add a {voice.customer.toLowerCase()} first.
        </p>
        <WizardActions
          back={setupHref("customer", intent)}
          continueLabel=""
        />
      </div>
    );
  }
  return (
    <form action={saveJobAction} className="setup-pane stack">
      <input type="hidden" name="setup" value="1" />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="status" value="unscheduled" />
      <p className="setup-context">
        For {customerName || `this ${voice.customer.toLowerCase()}`}.
      </p>
      <label>
        {voice.jobTitleLabel}
        <input name="title" required placeholder={voice.jobPlaceholder} enterKeyHint="next" />
      </label>
      <label>
        When
        <input name="scheduled_start" type="datetime-local" />
      </label>
      <WizardActions
        back={setupHref(prevSetupStep("job", intent), intent)}
        skip={setupHref(nextSetupStep("job", intent), intent)}
        skipLabel="Skip for now"
        continueLabel="Continue"
      />
    </form>
  );
}

function CashPane({ intent }: { intent: SereSetupIntent }) {
  return (
    <form action={connectStripeAction} className="setup-pane">
      <input type="hidden" name="next" value={setupHref("done", intent)} />
      <input type="hidden" name="error_next" value={setupHref("cash", intent)} />
      <StripeKeyTutorial />
      <label className="setup-key-field">
        Restricted key
        <input
          className="input"
          name="stripe_secret_key"
          type="password"
          autoComplete="off"
          required
          spellCheck={false}
          placeholder="rk_test_..."
        />
      </label>
      <WizardActions
        back={setupHref(prevSetupStep("cash", intent), intent)}
        skip={setupHref("done", intent)}
        skipLabel="Skip for now"
        continueLabel="Connect and continue"
      />
    </form>
  );
}

function DonePane({
  voice,
  customerName,
  jobTitle,
}: {
  voice: TradeProfile;
  customerName?: string;
  jobTitle?: string;
}) {
  return (
    <div className="setup-pane">
      <ul className="setup-recap">
        {customerName ? (
          <li>
            {voice.customer}: {customerName}
          </li>
        ) : null}
        {jobTitle ? (
          <li>
            {voice.job}: {jobTitle}
          </li>
        ) : null}
        <li>Overview is collected, billed, and still owed.</li>
        <li>An invoice stays open until payments add up to the total.</li>
      </ul>
      <div className="setup-actions">
        <a className="btn btn-ghost" href={setupHref("purpose")}>
          Start over
        </a>
        <a className="btn" href="/overview">
          Open the book
        </a>
      </div>
    </div>
  );
}

function WizardActions({
  back,
  skip,
  skipLabel,
  continueLabel,
}: {
  back?: string;
  skip?: string;
  skipLabel?: string;
  continueLabel: string;
}) {
  return (
    <div className="setup-actions">
      <div className="setup-actions-left">
        {back ? (
          <a className="btn btn-ghost" href={back}>
            Back
          </a>
        ) : (
          <a className="btn btn-ghost" href="/overview">
            Cancel
          </a>
        )}
        {skip ? (
          <a className="tiny setup-skip" href={skip}>
            {skipLabel || "Skip"}
          </a>
        ) : null}
      </div>
      {continueLabel ? (
        <button className="btn" type="submit">
          {continueLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SetupResumeCard({
  href,
  stepLabel,
  title,
  body,
}: {
  href: string;
  stepLabel: string;
  title: string;
  body: string;
}) {
  return (
    <div className="card setup-resume">
      <p className="setup-count">{stepLabel}</p>
      <strong>{title}</strong>
      <p>{body}</p>
      <a className="btn btn-connect btn-sere" href={href}>
        Continue
      </a>
    </div>
  );
}

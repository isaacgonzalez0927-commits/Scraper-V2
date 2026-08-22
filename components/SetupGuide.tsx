"use client";

import { useEffect, useState } from "react";
import {
  connectStripeAction,
  saveCustomerAction,
  saveJobAction,
  saveShopSetupAction,
  setupInvoiceAction,
} from "@/app/actions";
import {
  STRIPE_LIVE_API_KEYS_URL,
  STRIPE_SANDBOX_API_KEYS_URL,
} from "@/lib/stripe-keys";
import {
  validateSetupAmount,
  validateSetupEmail,
  validateSetupKey,
  validateSetupName,
  type SetupField,
  type SetupGuideView,
  type SetupMilestone,
  type SetupMilestoneId,
  type SetupSnapshot,
} from "@/lib/sere-setup";

const STORE = "sere-setup-guide-v1";

type Store = { collapsed: boolean; dismissed: boolean };

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return { collapsed: false, dismissed: false };
    const parsed = JSON.parse(raw) as Store;
    return {
      collapsed: Boolean(parsed.collapsed),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return { collapsed: false, dismissed: false };
  }
}

function saveStore(next: Store) {
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // Private mode. The guide still works for this session.
  }
}

export function SetupGuide({
  guide,
  snapshot,
  customerFields,
  jobFields,
  returnTo,
  frozen,
  jobTitleLabel,
  jobPlaceholder,
}: {
  guide: SetupGuideView;
  snapshot: SetupSnapshot;
  customerFields: SetupField[];
  jobFields: SetupField[];
  returnTo: string;
  frozen?: boolean;
  jobTitleLabel: string;
  jobPlaceholder: string;
}) {
  const [store, setStore] = useState<Store>({ collapsed: false, dismissed: false });
  const [openId, setOpenId] = useState<SetupMilestoneId | null>(guide.nextId);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsOpen = params.get("guide") === "open";
    const error = params.get("error");
    const saved = loadStore();
    setStore({
      collapsed: wantsOpen ? false : saved.collapsed,
      dismissed: wantsOpen ? false : guide.complete ? saved.dismissed : false,
    });
    if (wantsOpen && guide.nextId) setOpenId(guide.nextId);
    if (error) setFlash(error);
  }, [guide.complete, guide.nextId]);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  if (guide.complete && store.dismissed) return null;

  function collapse() {
    setStore({ collapsed: true, dismissed: guide.complete });
  }

  function expand() {
    setStore({ collapsed: false, dismissed: false });
    if (guide.nextId) setOpenId(guide.nextId);
  }

  function toggleMilestone(item: SetupMilestone) {
    if (item.state === "locked") return;
    setOpenId((current) => (current === item.id ? null : item.id));
    setStore((prev) => ({ ...prev, collapsed: false, dismissed: false }));
  }

  return (
    <aside className={`setup-guide${store.collapsed ? " is-collapsed" : ""}${guide.complete ? " is-complete" : ""}`} aria-label="Setup guide">
      <header className="setup-guide-head">
        <strong>Setup guide</strong>
        <div className="setup-guide-tools">
          {store.collapsed ? (
            <button className="setup-guide-icon" type="button" onClick={expand} aria-label="Expand setup guide">
              Expand
            </button>
          ) : (
            <button className="setup-guide-icon" type="button" onClick={collapse} aria-label={guide.complete ? "Dismiss setup guide" : "Minimize setup guide"}>
              {guide.complete ? "Close" : "Hide"}
            </button>
          )}
        </div>
      </header>
      <div className="setup-guide-bar" aria-hidden="true">
        <span style={{ width: `${guide.percent}%` }} />
      </div>
      <p className="setup-guide-next">
        {guide.complete ? (
          "The shop is live."
        ) : (
          <>
            Next:{" "}
            <button type="button" onClick={expand}>
              {guide.nextLabel}
            </button>
          </>
        )}
        <span>
          {guide.done} of {guide.total}
        </span>
      </p>
      {flash ? <p className="setup-guide-error setup-guide-flash">{flash}</p> : null}
      {store.collapsed ? null : (
        <ol className="setup-guide-list">
          {guide.milestones.map((item) => (
            <li key={item.id} className={`setup-guide-item is-${item.state}${openId === item.id ? " is-open" : ""}`}>
              <button
                className="setup-guide-item-btn"
                type="button"
                disabled={item.state === "locked"}
                onClick={() => toggleMilestone(item)}
                aria-expanded={openId === item.id}
              >
                <span className="setup-guide-mark" aria-hidden="true" />
                <span>
                  <strong>{item.title}</strong>
                  {item.state === "locked" ? <em>{item.lockReason}</em> : null}
                </span>
              </button>
              {openId === item.id && item.state !== "locked" ? (
                <div className="setup-guide-body">
                  <p>{item.body}</p>
                  <ul className="setup-guide-reqs">
                    {item.requirements.map((req) => (
                      <li key={req.id} className={req.done ? "is-done" : ""}>
                        <span>{req.label}</span>
                        {req.tip ? (
                          <abbr className="setup-guide-tip" title={req.tip}>
                            Why
                          </abbr>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {item.state === "done" ? (
                    <p className="setup-guide-saved">Saved. You can come back to this any time.</p>
                  ) : frozen ? (
                    <p className="setup-guide-saved">Trial ended. You can look, not add.</p>
                  ) : (
                    <MilestoneForm
                      id={item.id}
                      snapshot={snapshot}
                      customerFields={customerFields}
                      jobFields={jobFields}
                      returnTo={returnTo}
                      jobTitleLabel={jobTitleLabel}
                      jobPlaceholder={jobPlaceholder}
                    />
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function MilestoneForm({
  id,
  snapshot,
  customerFields,
  jobFields,
  returnTo,
  jobTitleLabel,
  jobPlaceholder,
}: {
  id: SetupMilestoneId;
  snapshot: SetupSnapshot;
  customerFields: SetupField[];
  jobFields: SetupField[];
  returnTo: string;
  jobTitleLabel: string;
  jobPlaceholder: string;
}) {
  if (id === "shop") {
    return (
      <form action={saveShopSetupAction} className="setup-guide-form">
        <input type="hidden" name="next" value={returnTo} />
        <GuideField name="name" label="Shop name" defaultValue={snapshot.shopName} required validate={validateSetupName} tip="Prints on invoices." />
        <GuideField name="phone" label="Shop phone" defaultValue={snapshot.shopPhone} tip="Optional. Customers see it on the invoice." />
        <GuideField name="email" label="Shop email" type="email" defaultValue={snapshot.shopEmail} validate={validateSetupEmail} />
        <button className="btn btn-block" type="submit">
          Save shop
        </button>
      </form>
    );
  }
  if (id === "customer") {
    return (
      <form action={saveCustomerAction} className="setup-guide-form" noValidate>
        <input type="hidden" name="setup" value="1" />
        <input type="hidden" name="next" value={returnTo} />
        <GuideField name="name" label="Name" required validate={validateSetupName} tip="Who you work for. A name is enough." />
        <GuideField name="phone" label="Phone" />
        <GuideField name="email" label="Email" type="email" validate={validateSetupEmail} />
        {customerFields.map((field) => (
          <GuideField
            key={field.key}
            name={`detail_${field.key}`}
            label={field.label}
            placeholder={field.placeholder}
            tip={field.help}
          />
        ))}
        <button className="btn btn-block" type="submit">
          Save
        </button>
      </form>
    );
  }
  if (id === "job") {
    if (!snapshot.latestCustomerId) return null;
    return (
      <form action={saveJobAction} className="setup-guide-form">
        <input type="hidden" name="setup" value="1" />
        <input type="hidden" name="next" value={returnTo} />
        <input type="hidden" name="customer_id" value={snapshot.latestCustomerId} />
        <input type="hidden" name="status" value="unscheduled" />
        <p className="setup-guide-context">For {snapshot.latestCustomerName}.</p>
        <GuideField name="title" label={jobTitleLabel} required placeholder={jobPlaceholder} validate={validateSetupName} />
        <GuideField name="scheduled_start" label="When" type="datetime-local" />
        {jobFields.map((field) => (
          <GuideField
            key={field.key}
            name={`detail_${field.key}`}
            label={field.label}
            placeholder={field.placeholder}
            tip={field.help}
          />
        ))}
        <button className="btn btn-block" type="submit">
          Save
        </button>
      </form>
    );
  }
  if (id === "invoice") {
    if (!snapshot.latestJobId) return null;
    return (
      <form action={setupInvoiceAction} className="setup-guide-form">
        <input type="hidden" name="job_id" value={snapshot.latestJobId} />
        <input type="hidden" name="next" value={returnTo} />
        <p className="setup-guide-context">From {snapshot.latestJobTitle}.</p>
        <GuideField
          name="amount"
          label="Amount"
          required
          inputMode="decimal"
          placeholder="0.00"
          validate={validateSetupAmount}
          tip="What you billed. The invoice stays open until this is paid."
        />
        <button className="btn btn-block" type="submit">
          Create invoice
        </button>
      </form>
    );
  }
  return (
    <form action={connectStripeAction} className="setup-guide-form">
      <input type="hidden" name="next" value={returnTo} />
      <input type="hidden" name="error_next" value={returnTo} />
      <p className="setup-guide-context">
        Stripe sandbox → Developers → API keys. Create a restricted key. Tick Customize
        permissions.{" "}
        <a href={STRIPE_SANDBOX_API_KEYS_URL} target="_blank" rel="noreferrer">
          Open sandbox
        </a>
        {" · "}
        <a href={STRIPE_LIVE_API_KEYS_URL} target="_blank" rel="noreferrer">
          Live
        </a>
        .
      </p>
      <GuideField
        name="stripe_secret_key"
        label="Restricted key"
        type="password"
        required
        placeholder="rk_test_..."
        validate={validateSetupKey}
        tip="rk_test_ or rk_live_ only. The full sk_ key can move money."
      />
      <button className="btn btn-block btn-stripe" type="submit">
        Connect
      </button>
    </form>
  );
}

function GuideField({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
  tip,
  inputMode,
  validate,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  tip?: string;
  inputMode?: "decimal" | "email" | "tel" | "text";
  validate?: (value: string) => string;
}) {
  const [error, setError] = useState("");
  return (
    <label className={error ? "has-error" : ""}>
      <span>
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
        {tip ? (
          <abbr className="setup-guide-tip" title={tip}>
            Why
          </abbr>
        ) : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={type === "password" ? false : undefined}
        onBlur={(event) => {
          if (validate) setError(validate(event.target.value));
        }}
        onInput={(event) => {
          if (error && validate) setError(validate(event.currentTarget.value));
        }}
      />
      {error ? <em className="setup-guide-error">{error}</em> : null}
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { SetupGuideView, SetupMilestone, SetupMilestoneId } from "@/lib/sere-setup";

const STORE = "sere-setup-guide-v2";

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
    // Private mode. The list still works for this session.
  }
}

export function SetupGuide({ guide }: { guide: SetupGuideView }) {
  // Start compact so the guide never flashes over a phone action before hydration.
  const [store, setStore] = useState<Store>({ collapsed: true, dismissed: false });
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<SetupMilestoneId | null>(guide.nextId);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsOpen = params.get("guide") === "open";
    const saved = loadStore();
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    setStore({
      // Mobile keeps setup in More. An explicit guide link still opens the
      // checklist for the person who asked to see it.
      collapsed: wantsOpen ? false : mobile ? true : saved.collapsed,
      dismissed: wantsOpen ? false : guide.complete ? saved.dismissed : false,
    });
    if (wantsOpen && guide.nextId) setOpenId(guide.nextId);
    setReady(true);
  }, [guide.complete, guide.nextId]);

  useEffect(() => {
    if (ready) saveStore(store);
  }, [ready, store]);

  if (guide.complete && store.dismissed) return null;

  function toggle(item: SetupMilestone) {
    if (item.state === "locked") return;
    setOpenId((current) => (current === item.id ? null : item.id));
    setStore((prev) => ({ ...prev, collapsed: false, dismissed: false }));
  }

  return (
    <aside
      className={`setup-guide${store.collapsed ? " is-collapsed" : ""}${guide.complete ? " is-complete" : ""}`}
      aria-label="Still open"
    >
      <header className="setup-guide-head">
        <strong>Still open{store.collapsed && !guide.complete ? ` · ${guide.total - guide.done} left` : ""}</strong>
        <button
          className="setup-guide-icon"
          type="button"
          onClick={() =>
            setStore({
              collapsed: !store.collapsed,
              dismissed: guide.complete && !store.collapsed,
            })
          }
          aria-label={guide.complete ? "Dismiss" : store.collapsed ? "Expand" : "Hide"}
        >
          {guide.complete ? "Close" : store.collapsed ? "Show" : "Hide"}
        </button>
      </header>
      <div className="setup-guide-bar" aria-hidden="true">
        <span style={{ width: `${guide.percent}%` }} />
      </div>
      <p className="setup-guide-next">
        {guide.complete ? (
          "Nothing left."
        ) : guide.nextHref ? (
          <>
            Next: <a href={guide.nextHref}>{guide.nextLabel}</a>
          </>
        ) : (
          "Next"
        )}
        <span>
          {guide.done} of {guide.total}
        </span>
      </p>
      {store.collapsed ? null : (
        <ol className="setup-guide-list">
          {guide.milestones.map((item) => (
            <li key={item.id} className={`setup-guide-item is-${item.state}${openId === item.id ? " is-open" : ""}`}>
              <button
                className="setup-guide-item-btn"
                type="button"
                disabled={item.state === "locked"}
                onClick={() => toggle(item)}
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
                      </li>
                    ))}
                  </ul>
                  {item.state === "done" ? (
                    <p className="setup-guide-saved">Done. It stays done when you come back.</p>
                  ) : (
                    <a className="btn btn-sm" href={item.href}>
                      Open
                    </a>
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

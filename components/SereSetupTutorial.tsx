import { ConnectSereButton } from "@/components/ConnectSere";
import { sereHowItWorks, sereSetupSteps, type SereVoice } from "@/lib/sere-setup";

export function SereSetupTutorial({
  voice,
  defaultOpen = true,
  showOpenBook = false,
}: {
  voice: SereVoice;
  defaultOpen?: boolean;
  showOpenBook?: boolean;
}) {
  const ideas = sereHowItWorks(voice);
  const steps = sereSetupSteps(voice);
  return (
    <div className={`key-guide how-sere${defaultOpen ? "" : " key-guide-collapsed"}`}>
      <p className="key-guide-lede">
        Same idea as the Stripe Developers walkthrough. Read how the book
        works, then tap through the steps. You can come back from Settings
        any time.
      </p>
      <p className="how-sere-label">How the book works</p>
      <ol className="key-steps">
        {ideas.map((idea) => (
          <li key={idea}>{idea}</li>
        ))}
      </ol>
      <p className="how-sere-label">Set the shop up</p>
      <ol className="key-steps" start={ideas.length + 1}>
        {steps.map((step) => (
          <li key={step.id}>
            <a className="btn btn-connect btn-sere" href={step.href}>
              {step.action}
            </a>
            <span className="tiny" style={{ display: "block", marginTop: 6 }}>
              {step.body}
            </span>
          </li>
        ))}
      </ol>
      {showOpenBook ? (
        <p className="how-sere-done">
          <ConnectSereButton href="/overview" label="Open the book" />
          <span className="tiny" style={{ display: "block", marginTop: 8 }}>
            Empty screens are normal until you add the first {voice.customer.toLowerCase()}.
          </span>
        </p>
      ) : null}
    </div>
  );
}

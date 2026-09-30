import { ShieldCheck } from "lucide-react";
import type { AssistContext } from "../data/contextFixture";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(date));

export function ContextPreview({ context }: { context: AssistContext }) {
  return (
    <section className="context-preview">
      <div className="preview-header">
        <h2>Shared with KBC</h2>
        <span className="safe-badge">
          <ShieldCheck size={13} /> Summary only
        </span>
      </div>
      <p className="fixture-label">Validated intent summary</p>
      <dl className="context-grid">
        <div>
          <dt>Intent</dt>
          <dd>{context.intent}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd className="capitalize">{context.confidence}</dd>
        </div>
        <div>
          <dt>Safe signals</dt>
          <dd>
            <ul>
              {context.signals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="context-times">
          <dt>Received (Belgian time)</dt>
          <dd>
            <time dateTime={context.receivedAt}>
              {formatDate(context.receivedAt)}
            </time>
          </dd>
          <dt>Expires (Belgian time)</dt>
          <dd>
            <time dateTime={context.expiresAt}>
              {formatDate(context.expiresAt)}
            </time>
          </dd>
        </div>
      </dl>
      <details className="payload-details">
        <summary>Exact received payload</summary>
        <pre>{JSON.stringify(context, null, 2)}</pre>
      </details>
    </section>
  );
}

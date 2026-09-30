import { useEffect, useState } from "react";
export function App() {
  const [status, setStatus] = useState("Checking local backend...");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/health", { signal: controller.signal })
      .then((r) =>
        setStatus(r.ok ? "Local backend is ready" : "Backend unavailable"),
      )
      .catch(() => {
        if (!controller.signal.aborted) setStatus("Backend unavailable");
      });
    return () => controller.abort();
  }, []);
  return (
    <main>
      <p className="eyebrow">Hackathon prototype</p>
      <h1>KBC Assist</h1>
      <p>Understand intent. Find relevant help. Keep the user in control.</p>
      <p role="status" className="status">
        {status}
      </p>
      <section aria-labelledby="integration">
        <h2 id="integration">Integration shell</h2>
        <ul>
          <li>Capture and privacy filtering: teammate integration pending.</li>
          <li>
            Context builder and cloud intent API: available in the backend.
          </li>
          <li>
            Catalogue matching: available in the backend. Notifications and
            assistant screens: integration pending.
          </li>
        </ul>
        <p>No screen capture or cloud analysis starts from this page.</p>
      </section>
    </main>
  );
}

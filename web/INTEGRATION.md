# Connecting the KBC suggestions UI

The UI defaults to the demo adapter. To use the existing backend, construct one stable adapter outside the React render function and pass it into App:


define the source in your application bootstrap:

~~~tsx
import App from './App'
import { createApiAssistSource } from './data/assistApi'

const assistSource = createApiAssistSource({
  baseUrl: '/api',
  pollMs: 1500,
  getSession: async (signal) => {
    // Return the capture pipeline's authenticated in-memory session:
    // { sessionId, sessionToken, expiresAt }.
    // This callback runs after the user enables Assist.
    return sessionManager.getSession(signal)
  },
})

// In your existing React root:
<App assistSource={assistSource} />
~~~

sessionManager above is your integration code, not an included module. If starting a session here, use the exported startAssistSession(pairingToken, signal) helper after consent and share its returned credentials with the capture pipeline. Do not embed tokens in VITE_* variables or persist them in browser storage.

The adapter calls POST /api/session/resume, then polls GET /api/context and GET /api/services/recommendation. A second context read checks for changes during the recommendation request. Requests carry Authorization and X-Session-Id. The existing Vite /api proxy points at port 3000; the backend must allow the browser Origin.

AssistSource is the replaceable boundary in assist.ts: watch receives an AbortSignal and onSnapshot/onError callbacks; pause and deleteContext return promises. A WebSocket or SSE implementation can use the same boundary later. Both the bank card and marketplace banner consume the same AssistSnapshot. Content and service metadata come from the selected recommendation, with car-loan copy in presentSuggestion. Guide/checklist and transaction recommendations are suppressed; service selection belongs to the backend.

The marketplace banner uses suggestion.id for identity, waits 1.8 seconds, opens KBC Context on click, and remembers dismissals for the current enabled session. Repeated snapshots with the same ID do not replay it. Pause, delete and expiry remove the banner; re-enabling starts a new UI session.

Pause/delete abort local observation immediately and call the matching backend controls. Controls are serialized to preserve order across rapid toggles. Errors stop observation and show an error status; toggle Assist off and on to retry. No demo fallback is used after an API error. Capture startup, sanitization, POST /api/intent/analyze, capture pause/delete, credential renewal and final service navigation remain the integrating application's responsibility. The CTA currently opens an in-place service preview; recommendation.path and requiresAuthentication are preserved for the future navigation handler.

The current backend model vocabulary is home-focused, so car intent recognition still needs backend integration. The UI adapter does not alter that vocabulary or fabricate car recommendations in API mode. See ../../docs/integration.md for backend authentication and capture contracts.

The partner form starts with the editable sample email alex@example.com. Form data is not sent by this adapter.

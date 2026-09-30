# Vertex AI setup

Enable Vertex AI in a Google Cloud project with billing and grant the runtime identity permission to call it, such as roles/aiplatform.user. These cloud changes are not performed by this POC.

For local development, use Google Application Default Credentials:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Set VERTEX_PROJECT_ID, VERTEX_REGION, VERTEX_MODEL and VERTEX_TIMEOUT_MS in backend .env. The example selects gemini-2.5-flash-lite in europe-west1 with a five-second timeout. Verify model availability in your project/region using the [Vertex documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-lite). The global endpoint is also supported but does not imply European data residency.

Google auth obtains and refreshes tokens through ADC. Workload identity may supply ADC in a hosted environment; hosting is outside this local POC. No cloud token belongs in VITE_ variables, screenshots, source or logs. VERTEX_ACCESS_TOKEN is not used.

Requests contain reconstructed sanitized text and masked PNG vision parts, a separate system instruction, and a constrained JSON schema. The five-second deadline covers authentication and the provider call. A non-cancellable credential operation might finish later, but aborted work does not send context afterward. Network requests are aborted and late results ignored.

Missing credentials, denied IAM, unavailable models, provider errors, safety blocks, truncated output, malformed JSON and invalid schema return null intent, empty signals and uncertainty. Error bodies from Google are not returned or logged. Verify a live setup only with consented synthetic sanitized context. Unit tests mock both credentials and transport and never contact Vertex.

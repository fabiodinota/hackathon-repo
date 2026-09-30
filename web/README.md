# KBC Assist frontend

React + Vite + TypeScript demo in the repository’s `web/` workspace. The backend remains in root `src/`, and the privacy service remains in `services/privacy/`.

## Run

Use Node.js 22.12+ or Node.js 24. From `web/`:

```sh
bun install --frozen-lockfile
npm run dev
```

If Bun is not global, `npx --yes bun@1.4.2 install --frozen-lockfile` uses the repository’s Bun version. Open http://127.0.0.1:5173. `npm run build` creates `dist/`, `npm run preview` serves it, and `npm test` runs the frontend interaction suite. Root `npm test` runs only backend tests. CI validates both components.

The existing Vite proxy forwards `/api` and `/health` to port 3000. Docker Compose retains the existing Nginx frontend build and API proxy. The demo itself does not make backend requests.

## Demo flow

The page shows two separate, equally sized mobile frames. KBC Home has static banking content. Open Context, opt into Assist, and wait 1.1 seconds for a synthetic home-buying summary. View the checklist or explanation, inspect the exact context, dismiss the suggestion, pause requests, or delete context. Context expires after 15 minutes; refreshing resets consent and state.

The brown partner marketplace shows a car illustration, price, and Order now button. Its form accepts name, email, phone, postcode, and preferred delivery month for a future redaction demonstration. Continue validates required fields and shows a local completion view. It places no order and sends no data. Use synthetic input.

## Files and integration boundary

- `src/features/assistant/`: KBC screens, Assist cards, checklist, and explanation dialog.
- `src/features/activity/`: partner car listing and local order form.
- `src/components/PhoneFrame.tsx`: shared frame and banking navigation.
- `src/App.tsx`: state machine and frame composition.
- `src/data/contextFixture.ts`: deterministic fixture and display model.

The existing backend contracts are documented in `../docs/integration.md`. A future adapter should map the authenticated API response into this UI model and use the existing consent/session routes. The fixture’s 15-minute expiry is demo-only; backend context and session expiry remain five minutes.

This frontend captures no screenshots, runs no vision model, and performs no redaction. Screenshots staying local and intent-only sharing describe the intended pipeline. Banking balances and marketplace product details are synthetic.

# KBC Assist

React + Vite + TypeScript mobile banking proof of concept for the KBC hackathon track.

## Run

Requires Node.js 22.12+ or a recent Node.js 24 release.

Install dependencies with npm install, then start with npm run dev. Open the local URL printed in the terminal. npm run build creates the production output; npm run preview serves that output. npm test runs the Assist behavior tests.

## Demo flow

On entry, a Vaul drawer inside the KBC screen asks whether to enable context. Yes enables Assist immediately; No (or dismissing the drawer) leaves it off. The Context tab always lets you change the switch. After enabling, simulated car-shopping context appears after 1.1 seconds and suggests a KBC car loan. Explore KBC car loan opens a short service preview; it does not submit a loan application. Open the explanation, or choose Explore context to view the summary and exact payload on a separate preview screen. You can dismiss the suggestion, pause Assist, or delete context.

Pause and delete cancel pending requests. Context expires after 15 minutes. Reload resets the session. Turning Assist off and on starts a fresh demo request. Banking navigation, balances, and quick actions are static previews.

The page renders two independent mobile frames side by side: the KBC banking app and the partner car marketplace. The car listing shows a locally served Volvo EX30 photograph, price, and Order now button. Its order form provides name, email, phone, postcode, and preferred delivery month for your future redaction pipeline. Continue validates the form and shows a local completion screen; it does not send, store, redact, or place an order. On narrow screens, the two frames remain horizontally scrollable so both screens stay separate.

Photo: Alexander Migl (Alexander-93), [Volvo EX30 IMG 8923](https://commons.wikimedia.org/wiki/File:Volvo_EX30_IMG_8923.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The local image is the 1280px Wikimedia thumbnail; the photo credit is also shown below the image.

## Integration

The fixture adapter is in src/data/contextFixture.ts. Replace its call in App.tsx with your local API when available. The context contract contains intent, confidence, signals, receivedAt and expiresAt (ISO timestamps). The app suggests a car loan only for a high-confidence car-buying intent with supporting signals and an unexpired timestamp. Unknown or uncertain context produces no suggestion. The suggested service follows the supplied POC catalogue's car-loan entry.

All banking and context data are synthetic. This frontend does not capture screenshots or perform PII redaction. The privacy statement represents the intended local-service architecture; this demo verifies the UI flow only.

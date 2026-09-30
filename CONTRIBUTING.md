# Working together

- Inspect `git status` before editing. Teammates and other sessions share this checkout.
- Keep changes inside your assigned component; use adapters at boundaries.
- Do not reset, clean, rebase, force-push, or stage someone else's files.
- Keep authored source files under 500 lines where possible, with a hard ceiling of 700. Generated lockfiles are excluded.
- Root `src/` remains the existing backend. Frontend code goes under `web/`; Rust goes under `services/privacy/`.
- Reuse existing context, intent, and session contracts. Do not create competing stores or routes.
- Run root checks plus checks for the component changed. See `docs/docker.md`.
- Do not commit or push from setup scripts.

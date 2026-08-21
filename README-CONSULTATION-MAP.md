# Dr M.Sha Consultation Map — local copy

This worktree is the isolated consultation-first redesign. The original Dr M.Sha
application remains in `..\Mshah Application` on `main`; this copy uses the local
`consultation-map-local` branch and has not been pushed or deployed.

## Run locally

1. Provide `ANTHROPIC_API_KEY` for the visual assessment and `OPENAI_API_KEY` for
   the optional generated annotation map.
2. Run `npm run dev -- -p 3007`.
3. Open `http://127.0.0.1:3007/`.

If the generated annotation map fails, the report automatically shows the
original photograph with local priority pins. Lead capture and the booking link
remain available. Local testing should leave GHL credentials unset to avoid
creating real contacts.

## Verification

- `npm run test:consultation`
- `npm run build`

The result contains exactly one highest cosmetic priority, up to two supporting
priorities, and a clinician-review boundary. Treatment suitability is always
reserved for Dr Sha’s consultation.

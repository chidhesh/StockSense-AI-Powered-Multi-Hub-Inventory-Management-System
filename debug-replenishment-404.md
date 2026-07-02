# [OPEN] Debug Session: replenishment-404

## Summary
- Symptom: Clicking `Request Replenishment` sends `POST /api/replenishment-requests` and receives `404 Cannot POST /api/replenishment-requests`.
- Expected: Request is accepted and stored without frontend or backend errors.

## Hypotheses
1. A non-project process is serving port `8787`, so the frontend reaches the wrong backend.
2. The project backend process is running, but it predates the replenishment route and was not restarted.
3. The frontend request reaches the backend, but a middleware or route mounting mismatch prevents the POST route from being registered.
4. The root `npm run dev` workflow does not start the API, so the environment is easy to misconfigure and reproduce inconsistently.

## Evidence Log
- Pending runtime verification.

## Next Step
- Inspect active listeners on `8787`, confirm the mounted route in source, and start the correct backend/frontend pair for reproduction.

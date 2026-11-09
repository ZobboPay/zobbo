# Zobbo indexer

Soroban RPC only keeps about a week of events, so older tips vanish from the tip wall. This indexer ingests the contract's `tip` and `register` events into Postgres, and the web app reads full history through `GET /api/tips`.

```
Soroban RPC ──► indexer (poll loop) ──► Postgres ◄── web /api/tips ◄── TipWall / dashboard
                                                          └─ falls back to RPC if the API is down
```

## Run it

```bash
cd indexer
cp .env.example .env      # fill in values
npm install
set -a; . ./.env; set +a
npm start                 # long-running poller
npm run once              # drain once and exit (cron / serverless job)
```

The schema (`schema.sql`) is applied automatically on start.

### Environment

| Var | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `ZOBBO_CONTRACT_ID` | yes | Deployed Zobbo contract (`C...`) |
| `RPC_URL` | no | Defaults to the testnet Soroban RPC |
| `START_LEDGER` | no | Ledger to start from on the first run. Defaults to the oldest ledger the RPC retains. Set it to the contract's deploy ledger when you can. |
| `POLL_SECONDS` | no | Poll interval when caught up (default 10) |

**Index from the contract's deploy ledger** (or start the indexer within a week of deploy). Events the RPC has already dropped can't be recovered.

## Guarantees

- **Idempotent:** events are keyed by their RPC event id and inserted with `ON CONFLICT DO NOTHING`. Re-running, or running two indexers, creates no duplicates.
- **Resumable:** the last processed event id and ledger are stored in `indexer_state`, updated in the same transaction as the inserts. A crash resumes from there.

## Read API (web)

Set `DATABASE_URL` (same database) in `web/.env.local`. It is server-only.

`GET /api/tips?handle=<handle>&limit=20&cursor=<nextCursor>`

```json
{ "tips": [{ "id": "...", "from": "G...", "amount": "10000000", "message": "gm", "at": "2026-01-01T00:00:00.000Z" }],
  "nextCursor": "..." }
```

Newest first, `limit` 1–100, `nextCursor` is `null` on the last page. `handle` is optional. Returns 503 when the database isn't configured, and the client then falls back to reading RPC events directly.

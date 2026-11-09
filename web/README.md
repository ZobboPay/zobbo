# Zobbo web

Next.js 14 (App Router) + Tailwind. Wallets: Freighter, xBull, Lobstr and more via `@creit.tech/stellar-wallets-kit`. Chain access: `@stellar/stellar-sdk`.

```bash
npm install
npm run dev        # http://localhost:3000
```

Contract config comes from `.env.local`, written by `../contracts/deploy.sh` (see `.env.example`).

| Route | Purpose |
|---|---|
| `/` | Landing |
| `/create` | Claim a handle |
| `/[handle]` | Public tip page + wall |
| `/[handle]/qr` | Printable QR card |
| `/dashboard` | Totals and recent tips |

Brand assets: `public/brand/` (SVG + PNG). The tip wall reads full history from `/api/tips`, backed by the Postgres indexer in [`../indexer`](../indexer/README.md) (set `DATABASE_URL`). Without it, the wall falls back to RPC events, which only keep about a week.

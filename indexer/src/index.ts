import { SorobanRpc, scValToNative } from "@stellar/stellar-sdk";
import pg from "pg";
import { readFileSync } from "node:fs";

const DATABASE_URL = need("DATABASE_URL");
const RPC_URL = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT_ID = need("ZOBBO_CONTRACT_ID");
const POLL_MS = Number(process.env.POLL_SECONDS ?? 10) * 1000;
const PAGE = 200;
const once = process.argv.includes("--once");

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const rpc = new SorobanRpc.Server(RPC_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  id: string;
  type: "tip" | "register";
  handle: string;
  from: string | null;
  amount: string | null;
  message: string | null;
  ledger: number;
  closedAt: string;
}

function toRow(e: SorobanRpc.Api.EventResponse): Row | null {
  try {
    const kind = scValToNative(e.topic[0]);
    const handle = scValToNative(e.topic[1]) as string;
    const base = { id: e.id, handle, ledger: e.ledger, closedAt: e.ledgerClosedAt };
    if (kind === "tip") {
      const [from, amount, message] = scValToNative(e.value) as [string, bigint, string];
      return { ...base, type: "tip", from, amount: amount.toString(), message };
    }
    if (kind === "register") {
      return { ...base, type: "register", from: scValToNative(e.value) as string, amount: null, message: null };
    }
  } catch (err) {
    console.warn(`Skipping undecodable event ${e.id}:`, err);
  }
  return null;
}

async function getCursor(): Promise<{ cursor: string | null; ledger: number }> {
  const { rows } = await pool.query("SELECT cursor, ledger FROM indexer_state WHERE contract_id = $1", [CONTRACT_ID]);
  return rows[0] ? { cursor: rows[0].cursor, ledger: Number(rows[0].ledger) } : { cursor: null, ledger: 0 };
}

// Inserts events and advances the cursor in one transaction, so a crash can
// never leave the cursor ahead of stored events. Inserts are ON CONFLICT DO
// NOTHING, so replaying a range is harmless.
async function save(rows: Row[], cursor: string, ledger: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    for (const r of rows) {
      const res = await client.query(
        `INSERT INTO events (id, type, handle, from_address, amount, message, ledger, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.type, r.handle, r.from, r.amount, r.message, r.ledger, r.closedAt]
      );
      inserted += res.rowCount ?? 0;
    }
    await client.query(
      `INSERT INTO indexer_state (contract_id, cursor, ledger, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (contract_id) DO UPDATE SET cursor = EXCLUDED.cursor, ledger = EXCLUDED.ledger, updated_at = now()`,
      [CONTRACT_ID, cursor, ledger]
    );
    await client.query("COMMIT");
    return inserted;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

type Req = { cursor?: string; startLedger?: number; filters: SorobanRpc.Api.EventFilter[]; limit: number };

async function firstRequest(state: { cursor: string | null }): Promise<Req> {
  const filters: SorobanRpc.Api.EventFilter[] = [
    {
      type: "contract",
      contractIds: [CONTRACT_ID],
      // `tip` and `register` events both have a second topic (the handle).
      topics: [["*", "*"]],
    },
  ];
  if (state.cursor) return { cursor: state.cursor, filters, limit: PAGE };

  const latest = (await rpc.getLatestLedger()).sequence;
  const requested = process.env.START_LEDGER ? Number(process.env.START_LEDGER) : 1;
  return { startLedger: Math.min(Math.max(requested, 1), latest), filters, limit: PAGE };
}

// Drain everything currently available. Returns number of new rows stored.
async function sync(): Promise<number> {
  const state = await getCursor();
  let total = 0;
  let req = await firstRequest(state);

  for (;;) {
    let res: SorobanRpc.Api.GetEventsResponse;
    try {
      res = await rpc.getEvents(req as never);
    } catch (err) {
      // START_LEDGER / default start older than RPC retention: retry from the oldest ledger it holds.
      const m = /ledger range: (\d+) - (\d+)/.exec(String(err instanceof Error ? err.message : err));
      if (m && req.startLedger !== undefined) {
        req = { ...req, startLedger: Number(m[1]) };
        continue;
      }
      throw err;
    }

    const rows = res.events.map(toRow).filter((r): r is Row => r !== null);
    const last = res.events[res.events.length - 1];
    if (last) total += await save(rows, last.id, last.ledger);
    if (res.events.length < PAGE) return total;
    req = { cursor: last.id, filters: req.filters, limit: PAGE };
  }
}

async function main() {
  const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log(`Indexing ${CONTRACT_ID} via ${RPC_URL}`);

  do {
    try {
      const n = await sync();
      if (n) console.log(`Stored ${n} new event(s)`);
    } catch (err) {
      console.error("Sync failed:", err instanceof Error ? err.message : err);
      if (once) process.exitCode = 1;
    }
    if (!once) await sleep(POLL_MS);
  } while (!once);

  await pool.end();
}

main();

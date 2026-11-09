import { nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { contractId, isConfigured, server } from "./zobbo";

export interface TipEvent {
  id: string;
  from: string;
  amount: bigint;
  message: string;
  at: string;
}

const sym = (v: string) => nativeToScVal(v, { type: "symbol" }).toXDR("base64");
const str = (v: string) => nativeToScVal(v, { type: "string" }).toXDR("base64");

// Full history comes from the indexer API (see ../../indexer). If the API is
// unavailable we fall back to RPC, which only retains roughly a week of events.
export async function getTipEvents(handle?: string, limit = 50): Promise<TipEvent[]> {
  try {
    return await getTipEventsFromApi(handle, limit);
  } catch {
    return getTipEventsFromRpc(handle);
  }
}

async function getTipEventsFromApi(handle: string | undefined, limit: number): Promise<TipEvent[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (handle) qs.set("handle", handle);
  const res = await fetch(`/api/tips?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Tips API ${res.status}`);
  const body = (await res.json()) as {
    tips: { id: string; from: string; amount: string; message: string; at: string }[];
  };
  return body.tips.map((t) => ({ ...t, amount: BigInt(t.amount) }));
}

async function getTipEventsFromRpc(handle?: string): Promise<TipEvent[]> {
  if (!isConfigured) return [];
  const latest = await server.getLatestLedger();

  for (const window of [120_000, 50_000, 10_000]) {
    try {
      const res = await server.getEvents({
        startLedger: Math.max(1, latest.sequence - window),
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
            topics: [handle ? [sym("tip"), str(handle)] : [sym("tip"), "*"]],
          },
        ],
        limit: 200,
      });

      return res.events
        .map((e) => {
          const [from, amount, message] = scValToNative(e.value) as [string, bigint, string];
          return { id: e.id, from, amount: BigInt(amount), message, at: e.ledgerClosedAt };
        })
        .sort((a, b) => (a.id < b.id ? 1 : -1));
    } catch {
      // window older than RPC retention — try a smaller one
    }
  }
  return [];
}

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

// GET /api/tips?handle=&limit=&cursor=  — newest first, keyset-paginated.
// `cursor` is the `nextCursor` of the previous page.
export async function GET(req: NextRequest) {
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Indexer database not configured" }, { status: 503 });

  const q = req.nextUrl.searchParams;
  const handle = q.get("handle");
  const cursor = q.get("cursor");
  const limit = Math.min(Math.max(parseInt(q.get("limit") ?? "20", 10) || 20, 1), MAX_LIMIT);

  const where = ["type = 'tip'"];
  const params: unknown[] = [];
  if (handle) {
    params.push(handle);
    where.push(`handle = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor);
    where.push(`id < $${params.length}`);
  }
  params.push(limit + 1);

  try {
    const { rows } = await pool.query(
      `SELECT id, from_address, amount::text AS amount, message, closed_at
         FROM events WHERE ${where.join(" AND ")}
         ORDER BY id DESC LIMIT $${params.length}`,
      params
    );
    const page = rows.slice(0, limit);
    return NextResponse.json({
      tips: page.map((r) => ({
        id: r.id,
        from: r.from_address,
        amount: r.amount,
        message: r.message ?? "",
        at: new Date(r.closed_at).toISOString(),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    });
  } catch {
    return NextResponse.json({ error: "Query failed" }, { status: 503 });
  }
}

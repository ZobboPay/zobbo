import { Pool } from "pg";

// Reused across hot reloads / warm serverless invocations.
const g = globalThis as unknown as { __zobboPool?: Pool };

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return (g.__zobboPool ??= new Pool({ connectionString: url, max: 5 }));
}

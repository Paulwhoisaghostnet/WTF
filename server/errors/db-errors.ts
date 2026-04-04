export function classifyDbError(err: any): {
  status: number;
  error: string;
} | null {
  const code = err?.cause?.code || err?.code;
  const message = String(err?.cause?.message || err?.message || "");

  if (code === "3D000") {
    return {
      status: 503,
      error: "Database misconfigured: selected database does not exist.",
    };
  }
  if (code === "42P01") {
    return {
      status: 503,
      error: "Database schema missing: run migrations (`npm run db:push`).",
    };
  }
  if (code === "28P01") {
    return {
      status: 503,
      error: "Database authentication failed. Check DATABASE_URL credentials.",
    };
  }
  if (/timeout|ETIMEDOUT|Connection terminated/i.test(message)) {
    return {
      status: 503,
      error:
        "Database unavailable (connection timeout). Check DATABASE_URL/network and prefer Supabase pooler on serverless.",
    };
  }
  if (/Tenant or user not found/i.test(message)) {
    return {
      status: 503,
      error:
        "Database pooler credentials/region look invalid. Re-copy the exact Supabase pooler URL.",
    };
  }

  return null;
}

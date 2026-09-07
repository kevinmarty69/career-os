import 'server-only';
import postgres from 'postgres';

// Keep a bounded pool per credential across requests and Next development reloads.
const processState = globalThis as typeof globalThis & {
  careerApplicationPools?: Map<string, postgres.Sql>;
};
const pools: Map<string, postgres.Sql> =
  (processState.careerApplicationPools ??= new Map());

export function database(databaseUrl = process.env.DATABASE_URL): postgres.Sql {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  let sql = pools.get(databaseUrl);
  if (!sql) {
    sql = postgres(databaseUrl, { max: 5, idle_timeout: 5 });
    pools.set(databaseUrl, sql);
  }
  return sql;
}

export async function closeApplicationDatabases() {
  const clients = [...pools.values()];
  pools.clear();
  await Promise.all(clients.map((sql) => sql.end()));
}

export async function authorize(
  tx: postgres.TransactionSql,
  session: { userId: string; tenantId: string },
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}

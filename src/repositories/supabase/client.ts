import postgres from 'postgres';
import { env } from '../../config/env';

export type SqlClient = ReturnType<typeof postgres>;
/** Type for the transaction-scoped client passed to sql.begin() callbacks. */
export type TxClient = postgres.TransactionSql<{}>;

let _client: SqlClient | undefined;

export function getSqlClient(): SqlClient {
  if (!_client) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required when PERSISTENCE=supabase');
    _client = postgres(env.DATABASE_URL, {
      // Pool size per instance. max:1 caused head-of-line blocking in CMS — one slow
      // query held the ONLY connection and froze every other request (incl. login).
      // The Supabase transaction pooler (port 6543) multiplexes, so a small pool is
      // safe and lets concurrent requests run in parallel.
      max: 5,
      prepare: false,
      idle_timeout: 10, // close idle connections after 10s (stale TCP in serverless)
      max_lifetime: 60, // never keep a connection longer than 60s
      connect_timeout: 10, // fail fast if the DB doesn't respond
      connection: {
        statement_timeout: 15000, // kill any query running > 15s
      },
    });
  }
  return _client;
}

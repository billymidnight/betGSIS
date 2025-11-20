import dotenv from 'dotenv';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

dotenv.config();

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.warn('Warning: SUPABASE_DB_URL / DATABASE_URL is not set. DB connections will fail until configured.');
}

export const pool = new Pool({ connectionString });

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Acquire a client for a transaction or multiple queries. Remember to release the client.
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

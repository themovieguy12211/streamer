import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const pool = postgres(databaseUrl, { max: 10, prepare: false });
export const db = drizzle(pool);

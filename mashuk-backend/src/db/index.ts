import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import { createPool } from './pool.js';
import * as schema from './schema.js';

const pool = createPool(env.DATABASE_URL);

export { pool };
export const db = drizzle(pool, { schema });

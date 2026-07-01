import pkg from 'pg';

const { Pool } = pkg;

export function createPool(connectionString: string) {
  const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  return new Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });
}

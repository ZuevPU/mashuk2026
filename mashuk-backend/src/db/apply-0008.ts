/**
 * Add role_diagnostics_config to forum_settings.
 * npx tsx src/db/apply-0008.ts
 */
import 'dotenv/config';
import pg from 'pg';

const sql = `
ALTER TABLE forum_settings
  ADD COLUMN IF NOT EXISTS role_diagnostics_config jsonb;
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  console.log('apply-0008: role_diagnostics_config ok');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

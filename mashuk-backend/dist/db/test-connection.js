import 'dotenv/config';
import pg from 'pg';
const password = '2h,e}<lZMB5kC2';
const configs = [
    { host: '85.198.80.180', port: 5432, user: 'gen_user', password, database: 'default_db', ssl: { rejectUnauthorized: false } },
    { host: '85.198.80.180', port: 5432, user: 'gen_user', password, database: 'default_db', ssl: true },
    { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } },
];
for (const cfg of configs) {
    const client = new pg.Client(cfg);
    try {
        console.log('Trying:', JSON.stringify({ ...cfg, password: '***' }));
        await client.connect();
        const r = await client.query('SELECT NOW() as now');
        console.log('SUCCESS:', r.rows[0]);
        await client.end();
        process.exit(0);
    }
    catch (e) {
        console.error('FAILED:', e.message);
        try {
            await client.end();
        }
        catch { /* ignore */ }
    }
}
process.exit(1);

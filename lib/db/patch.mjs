import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.query("ALTER TYPE dispatch_status ADD VALUE IF NOT EXISTS 'exhausted';")
  .then(() => { console.log('Added exhausted to enum'); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });

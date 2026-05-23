import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('./node_modules/pg/lib/index.js');
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  // Check current columns on hosted_match_participants
  const res = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'hosted_match_participants' ORDER BY ordinal_position"
  );
  console.log('Columns:', res.rows.map(r => r.column_name).join(', '));

  // Check payment_type enum values
  const enumRes = await client.query(
    "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'payment_type' ORDER BY enumsortorder"
  );
  console.log('payment_type enum:', enumRes.rows.map(r => r.enumlabel).join(', '));
} finally {
  await client.end();
}

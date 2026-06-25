require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'ZandelDiag2024!';

async function main() {
  // Parse DATABASE_URL to extract dbname and build a root connection URL
  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.slice(1); // e.g. 'zandeldiag'
  url.pathname = '/postgres';

  // Connect to postgres to create the target DB if needed
  const rootClient = new Client({ connectionString: url.toString() });
  await rootClient.connect();

  const { rows } = await rootClient.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName]
  );
  if (rows.length === 0) {
    await rootClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database '${dbName}' created`);
  } else {
    console.log(`Database '${dbName}' already exists`);
  }
  await rootClient.end();

  // Connect to the target DB and run schema
  const appClient = new Client({ connectionString: process.env.DATABASE_URL });
  await appClient.connect();

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await appClient.query(schema);
  console.log('Schema applied');

  // Seed superadmin
  const existing = await appClient.query(
    'SELECT id FROM users WHERE username = $1',
    [SEED_USERNAME]
  );
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(SEED_PASSWORD, 12);
    await appClient.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'superadmin')",
      [SEED_USERNAME, hash]
    );
    console.log(`Superadmin '${SEED_USERNAME}' created`);
  } else {
    console.log(`Superadmin '${SEED_USERNAME}' already exists`);
  }

  await appClient.end();
  console.log('Setup complete');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});

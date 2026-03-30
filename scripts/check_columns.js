const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'motoriq',
  user: 'motoriq_user',
  password: 'motoriq_pass',
});

async function check() {
  try {
    const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'floor_plans'");
    console.log('Columns in floor_plans:', rows.map(r => r.column_name).join(', '));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();

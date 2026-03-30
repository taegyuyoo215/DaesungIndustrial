const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'motoriq',
  user: 'motoriq_user',
  password: 'motoriq_pass',
});

async function list() {
  try {
    const { rows } = await pool.query('SELECT id, name, created_at FROM floor_plans ORDER BY created_at DESC');
    console.log('Floor plans in DB:');
    rows.forEach(r => console.log(`ID: ${r.id}, Name: ${r.name}, Created: ${r.created_at}`));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

list();

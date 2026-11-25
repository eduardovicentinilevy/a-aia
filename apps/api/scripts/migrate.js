// Applies or reverts database migrations.
// Usage (from the repo root):
//   npm run db:migrate            apply every pending migration
//   npm run db:rollback           revert the latest migration
//   npm run db:rollback -- 2      revert the latest 2
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';

const [direction = 'up', stepsArg] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL?.trim();

if (direction !== 'up' && direction !== 'down') {
  console.error('Uso: migrate.js up|down [quantidade]');
  process.exit(1);
}
if (!databaseUrl) {
  console.error('Defina DATABASE_URL no .env (ou no ambiente) antes de migrar.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
try {
  const done = await migrate(pool, {
    direction,
    steps: stepsArg ? Number(stepsArg) : undefined,
    log: (line) => console.log(line),
  });
  console.log(done.length === 0 ? 'Nada a fazer: o banco já está atualizado.' : `${done.length} migração(ões) ${direction === 'up' ? 'aplicada(s)' : 'revertida(s)'}.`);
} catch (err) {
  console.error(`Erro: ${/** @type {Error} */ (err).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

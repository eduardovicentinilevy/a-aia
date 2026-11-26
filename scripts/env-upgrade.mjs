// Fixes values in .env that older versions of .env.example shipped and that are now wrong.
// Only EXACT old default values are replaced; anything you customized is left alone.
// Runs automatically before `npm run dev`, `npm run db:up` and `npm run db:migrate`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const UPGRADES = [
  {
    key: 'DATABASE_URL',
    // 5432: default of the first versions; 5433: second attempt (often a 2nd PostgreSQL install).
    from: ['postgres://acaia:acaia@localhost:5432/acaia', 'postgres://acaia:acaia@127.0.0.1:5433/acaia'],
    to: 'postgres://acaia:acaia@127.0.0.1:25432/acaia',
    why: 'o banco do Docker agora usa a porta 25432 (5432 e 5433 costumam ser de PostgreSQL instalado no computador)',
  },
];

/**
 * @param {string} text  Contents of a .env file.
 * @returns {{ text: string, changes: string[] }}
 */
export function upgradeEnv(text) {
  const changes = [];
  const lines = text.split(/\r?\n/).map((line) => {
    for (const upgrade of UPGRADES) {
      const match = new RegExp(`^(\\s*${upgrade.key}\\s*=\\s*)(.*?)\\s*$`).exec(line);
      if (match && upgrade.from.includes(match[2].replace(/^["']|["']$/g, ''))) {
        changes.push(`${upgrade.key}: ${upgrade.why}.`);
        return `${match[1]}${upgrade.to}`;
      }
    }
    return line;
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { text: lines.join(eol), changes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (existsSync('.env')) {
    const { text, changes } = upgradeEnv(readFileSync('.env', 'utf8'));
    if (changes.length > 0) {
      writeFileSync('.env', text);
      for (const change of changes) console.log(`.env atualizado → ${change}`);
    }
  }
}

// Creates .env from .env.example if it does not exist yet (cross-platform `cp`).
// Usage: npm run env:init
import { copyFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('.env já existe — nada a fazer.');
} else {
  copyFileSync('.env.example', '.env');
  console.log('.env criado a partir do .env.example. Edite-o para configurar o Pro.');
}

/**
 * Replace leftover «Тест Пользователь» names with VK users.get first/last name.
 * Run: npm run repair-names (from mashuk-backend)
 */
import 'dotenv/config';
import { repairAllPlaceholderNames } from '../services/participantName.js';

async function main() {
  const limit = Number(process.env.NAME_REPAIR_LIMIT || 500);
  const updated = await repairAllPlaceholderNames(limit);
  console.log(`repair-placeholder-names: updated=${updated} limit=${limit}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

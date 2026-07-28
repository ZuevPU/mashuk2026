/**
 * Подтягивает колонку «Реализовано» в spec-tracker-source.tsv,
 * если кодовый аудит уже «Да», а в TSV ещё «Нет».
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_TSV = path.join(__dirname, 'spec-tracker-source.tsv');

function repairUtf8(buffer) {
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

/**
 * @param {{ task: string, statusUser: string, statusAudit: string }[]} rows
 * @returns {{ updated: number }}
 */
export function syncUserImplementationStatusFromRows(rows, tsvPath = SOURCE_TSV) {
  if (!fs.existsSync(tsvPath)) return { updated: 0 };
  /** @type {Map<string, string>} */
  const syncMap = new Map();
  for (const r of rows) {
    if (r.sectionId >= 14) continue;
    if (r.statusUser === 'Нет' && r.statusAudit === 'Да') {
      syncMap.set(r.task.trim(), 'Да');
    }
    if (r.statusUser === 'Нет' && r.statusAudit === 'Частично') {
      syncMap.set(r.task.trim(), 'Частично');
    }
    if (r.statusUser === 'Проверить позже' && r.statusAudit === 'Да') {
      syncMap.set(r.task.trim(), 'Да');
    }
  }
  const lines = repairUtf8(fs.readFileSync(tsvPath)).split(/\r?\n/);
  let updated = 0;
  const out = lines.map((line) => {
    if (!line.trim()) return line;
    const parts = line.split('\t');
    if (parts.length < 3) return line;
    const task = (parts[1] ?? '').trim();
    const status = (parts[2] ?? '').trim();
    const next = syncMap.get(task);
    if (!next || !task) return line;
    if (status === next) return line;
    if (status === 'Нет' || status === 'Частично' || status.includes('Проверить')) {
      parts[2] = next;
      updated += 1;
      return parts.join('\t');
    }
    return line;
  });
  if (updated > 0) {
    fs.writeFileSync(tsvPath, out.join('\n'), 'utf8');
  }
  return { updated };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const jsonPath = path.join(__dirname, '..', 'docs', 'spec-tracker-data.json');
  const rows = JSON.parse(repairUtf8(fs.readFileSync(jsonPath)));
  const { updated } = syncUserImplementationStatusFromRows(rows);
  console.log('sync-user-implementation-status: updated', updated, 'rows');
}

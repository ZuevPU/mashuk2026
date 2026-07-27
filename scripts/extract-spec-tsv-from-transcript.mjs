import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tr = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'c-Users-Desktop',
  'agent-transcripts',
  'fb3a034e-b57d-4a86-b9f1-e3395913cff5',
  'fb3a034e-b57d-4a86-b9f1-e3395913cff5.jsonl',
);

const needle = '1. Регистрация и онбординг';
let found = false;

for (const line of fs.readFileSync(tr, 'utf8').split(/\n/)) {
  if (!line.includes(needle)) continue;
  const o = JSON.parse(line);
  const text = o.message?.content?.find((c) => c.type === 'text')?.text || '';
  const i = text.indexOf('Подраздел\tЗадача');
  const start = i >= 0 ? i : text.indexOf(needle);
  if (start < 0) continue;
  let slice = text.slice(start);
  const uq = slice.indexOf('</user_query>');
  if (uq >= 0) slice = slice.slice(0, uq);
  slice = slice.replace(/\n<timestamp>[\s\S]*$/, '').trim();
  const out = path.join(__dirname, 'spec-tracker-source.tsv');
  fs.writeFileSync(out, slice, 'utf8');
  const lines = slice.split(/\r?\n/);
  console.log('Wrote', out, lines.length, 'lines');
  console.log('First:', lines[0].slice(0, 100));
  found = true;
  break;
}

if (!found) {
  console.error('Table not found in transcript');
  process.exit(1);
}

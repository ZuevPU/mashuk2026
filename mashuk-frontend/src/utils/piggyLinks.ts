import { normalizeExternalUrl, openExternalUrl } from './openUrl';

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const FILE_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|mp3|mp4|png|jpe?g|webp|gif)(\?|#|$)/i;

export type PiggyLinkKind = 'file' | 'link';

export type PiggyLink = {
  url: string;
  kind: PiggyLinkKind;
  label: string;
};

function looksLikeFile(url: string): boolean {
  return FILE_RE.test(url) || /\/uploads\//i.test(url);
}

function cleanUrl(raw: string): string | null {
  return normalizeExternalUrl(raw.replace(/[.,;:)\]}>]+$/g, '').trim());
}

export function splitPiggybankText(text: string): { body: string; items: PiggyLink[] } {
  const items: PiggyLink[] = [];
  const seen = new Set<string>();

  const add = (raw: string, forced?: PiggyLinkKind) => {
    const url = cleanUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const kind: PiggyLinkKind = looksLikeFile(url) ? 'file' : (forced || 'link');
    items.push({
      url,
      kind,
      label: kind === 'file' ? 'Открыть файл' : 'Открыть ссылку',
    });
  };

  const bodyLines: string[] = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    const labeled = trimmed.match(/^(ссылка|файл|file|url)\s*:\s*(.+)$/i);
    if (labeled) {
      const kind: PiggyLinkKind = /файл|file/i.test(labeled[1]) ? 'file' : 'link';
      add(labeled[2], kind);
      continue;
    }
    const found = trimmed.match(URL_RE) || [];
    for (const raw of found) add(raw);
    if (found.length) {
      const cleaned = trimmed.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned) bodyLines.push(cleaned);
    } else {
      bodyLines.push(line);
    }
  }

  return { body: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), items };
}

export function openPiggyLink(url: string): void {
  openExternalUrl(url);
}

import { useMemo, useState } from 'react';
import type { AdminBlockFocus } from '../admin/types';
import { CHANGELOG, type ChangelogEntry } from './changelog';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function matchesQuery(entry: ChangelogEntry, q: string): boolean {
  if (!q) return true;
  const hay = [
    entry.title,
    entry.done,
    entry.admin,
    entry.participant,
    entry.adminWhere,
    entry.systemWhere,
    ...entry.links.map(l => l.label),
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

type Props = {
  onOpenBlock?: (focus: AdminBlockFocus) => void;
};

export function UpdatesJournal({ onOpenBlock }: Props) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(CHANGELOG[0]?.id ?? null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHANGELOG.filter(e => matchesQuery(e, q));
  }, [query]);

  return (
    <div>
      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar">
          <input
            className="adm-input"
            placeholder="Поиск по обновлениям"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <p className="adm-muted" style={{ marginBottom: 0 }}>
          Записей: {rows.length}. Новые сверху. Время — МСК.
        </p>
      </div>

      {rows.length === 0 && <p className="adm-muted">Ничего не найдено</p>}

      {rows.map(entry => {
        const open = openId === entry.id;
        return (
          <article key={entry.id} className="card adm-forum-block adm-changelog-card">
            <button
              type="button"
              className="adm-changelog-head"
              onClick={() => setOpenId(open ? null : entry.id)}
            >
              <div>
                <div className="adm-changelog-when">{formatWhen(entry.at)}</div>
                <h3 className="adm-changelog-title">{entry.title}</h3>
                <p className="adm-muted adm-changelog-done">{entry.done}</p>
              </div>
              <span className="adm-accordion-chevron" aria-hidden>{open ? '▼' : '▶'}</span>
            </button>

            {open && (
              <div className="adm-changelog-body">
                <div className="adm-changelog-links">
                  {entry.links.map(link => (
                    <button
                      key={`${link.tab}-${link.anchor || link.questionsKind || link.label}`}
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => onOpenBlock?.({
                        tab: link.tab,
                        anchor: link.anchor,
                        questionsKind: link.questionsKind,
                        label: link.label,
                      })}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>

                <dl className="adm-changelog-dl">
                  <div>
                    <dt>Админ</dt>
                    <dd>{entry.admin}</dd>
                  </div>
                  <div>
                    <dt>Участник</dt>
                    <dd>{entry.participant}</dd>
                  </div>
                  <div>
                    <dt>Где в админке</dt>
                    <dd>{entry.adminWhere}</dd>
                  </div>
                  <div>
                    <dt>Где система</dt>
                    <dd>{entry.systemWhere}</dd>
                  </div>
                </dl>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

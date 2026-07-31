import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import type { ProgramSpeaker } from '../program/types';
import { speakerFullLabel, speakerSearchHaystack } from './speakerFormat';

type RowDraft = { name: string; credentials: string };

const emptyDraft = (): RowDraft => ({ name: '', credentials: '' });

function rowDraftFromSpeaker(s: ProgramSpeaker): RowDraft {
  return { name: s.name, credentials: s.credentials || '' };
}

function isRowDirty(s: ProgramSpeaker, draft: RowDraft): boolean {
  return draft.name.trim() !== s.name
    || (draft.credentials.trim() || '') !== (s.credentials?.trim() || '');
}

export function SpeakersTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [speakers, setSpeakers] = useState<ProgramSpeaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newRow, setNewRow] = useState<RowDraft>(emptyDraft());
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/program-speakers');
      const list = res.speakers || [];
      setSpeakers(list);
      const map: Record<number, RowDraft> = {};
      for (const s of list) {
        map[s.id] = rowDraftFromSpeaker(s);
      }
      setDrafts(map);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return speakers;
    return speakers.filter(s => speakerSearchHaystack(s).includes(q));
  }, [speakers, search]);

  const patchDraft = (id: number, patch: Partial<RowDraft>) => {
    setDrafts(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const saveNew = () => {
    if (!newRow.name.trim()) {
      alert('Укажите ФИО спикера.');
      return;
    }
    act(async () => {
      await adminFetch('/program-speakers', {
        method: 'POST',
        body: JSON.stringify({
          name: newRow.name.trim(),
          credentials: newRow.credentials.trim() || null,
        }),
      });
      setNewRow(emptyDraft());
      await load();
    }, 'Спикер добавлен');
  };

  const saveRow = (s: ProgramSpeaker) => {
    const draft = drafts[s.id];
    if (!draft?.name.trim()) {
      alert('Укажите ФИО спикера.');
      return;
    }
    act(async () => {
      await adminFetch(`/program-speakers/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          credentials: draft.credentials.trim() || null,
        }),
      });
      await load();
    }, 'Сохранено');
  };

  const remove = (id: number) => {
    if (!confirmDelete('Удалить спикера из базы? Он останется в старых событиях по ID, но пропадёт из списка выбора.')) return;
    act(async () => {
      await adminFetch(`/program-speakers/${id}`, { method: 'DELETE' });
      await load();
    }, 'Удалено');
  };

  return (
    <div className="adm-speakers-page">
      <AdminPageHero
        title="Спикеры"
        hint="База для программы и базы знаний: ФИО и регалии. Редактируйте прямо в таблице — «Сохранить» для строки или «Удалить»."
      />

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Справочник ({speakers.length})</h3>
          <input
            className="adm-input"
            style={{ maxWidth: 280, marginLeft: 'auto' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по ФИО и регалиям…"
          />
        </div>

        {loading && <p className="adm-muted">Загрузка…</p>}

        {!loading && (
          <div className="adm-table-scroll">
            <table className="adm-table adm-speakers-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>ФИО</th>
                  <th style={{ minWidth: 280 }}>Регалии</th>
                  <th style={{ width: 160 }} />
                </tr>
              </thead>
              <tbody>
                <tr className="adm-speakers-table-new">
                  <td>
                    <input
                      className="adm-input adm-input-sm"
                      value={newRow.name}
                      onChange={e => setNewRow({ ...newRow, name: e.target.value })}
                      placeholder="Иванов Иван Иванович"
                    />
                  </td>
                  <td>
                    <textarea
                      className="adm-input adm-input-sm adm-speakers-cred-input"
                      rows={2}
                      value={newRow.credentials}
                      onChange={e => setNewRow({ ...newRow, credentials: e.target.value })}
                      placeholder="д.п.н., профессор МГУ…"
                    />
                  </td>
                  <td>
                    <div className="adm-speaker-row-actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn-primary adm-btn-sm"
                        onClick={saveNew}
                        disabled={!newRow.name.trim()}
                      >
                        Добавить
                      </button>
                    </div>
                  </td>
                </tr>

                {filtered.length === 0 && speakers.length > 0 && (
                  <tr>
                    <td colSpan={3} className="adm-muted">Ничего не найдено.</td>
                  </tr>
                )}

                {speakers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="adm-muted">Пока нет спикеров — добавьте строку выше.</td>
                  </tr>
                )}

                {filtered.map(s => {
                  const draft = drafts[s.id] ?? rowDraftFromSpeaker(s);
                  const dirty = isRowDirty(s, draft);
                  return (
                    <tr key={s.id} className={dirty ? 'adm-speakers-table-dirty' : undefined}>
                      <td>
                        <input
                          className="adm-input adm-input-sm"
                          value={draft.name}
                          onChange={e => patchDraft(s.id, { name: e.target.value })}
                        />
                        {s.initials && (
                          <span className="adm-muted adm-speakers-initials">{s.initials}</span>
                        )}
                      </td>
                      <td>
                        <textarea
                          className="adm-input adm-input-sm adm-speakers-cred-input"
                          rows={2}
                          value={draft.credentials}
                          onChange={e => patchDraft(s.id, { credentials: e.target.value })}
                        />
                      </td>
                      <td>
                        <div className="adm-speaker-row-actions">
                          <button
                            type="button"
                            className="adm-btn adm-btn-primary adm-btn-sm"
                            onClick={() => saveRow(s)}
                            disabled={!dirty || !draft.name.trim()}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className="adm-btn adm-btn-danger adm-btn-sm"
                            onClick={() => remove(s.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && speakers.length > 0 && (
          <p className="adm-forum-hint" style={{ marginTop: 12, marginBottom: 0 }}>
            В программе отображается: {speakerFullLabel(speakers[0]!)}
            {speakers.length > 1 ? ' (и аналогично для остальных)' : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

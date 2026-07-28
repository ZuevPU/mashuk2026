import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import type { ProgramSpeaker } from '../program/types';
import { speakerFullLabel, speakerSearchHaystack } from './speakerFormat';

type Draft = { name: string; credentials: string };

const emptyDraft = (): Draft => ({ name: '', credentials: '' });

export function SpeakersTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [speakers, setSpeakers] = useState<ProgramSpeaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newRow, setNewRow] = useState<Draft>(emptyDraft());
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Draft>(emptyDraft());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/program-speakers');
      setSpeakers(res.speakers || []);
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

  const startEdit = (s: ProgramSpeaker) => {
    setEditId(s.id);
    setEditRow({ name: s.name, credentials: s.credentials || '' });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditRow(emptyDraft());
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

  const saveEdit = () => {
    if (editId == null || !editRow.name.trim()) {
      alert('Укажите ФИО спикера.');
      return;
    }
    act(async () => {
      await adminFetch(`/program-speakers/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editRow.name.trim(),
          credentials: editRow.credentials.trim() || null,
        }),
      });
      cancelEdit();
      await load();
    }, 'Сохранено');
  };

  const remove = (id: number) => {
    if (!confirmDelete('Удалить спикера из базы? Он останется в старых событиях по ID, но пропадёт из списка выбора.')) return;
    act(async () => {
      await adminFetch(`/program-speakers/${id}`, { method: 'DELETE' });
      if (editId === id) cancelEdit();
      await load();
    }, 'Удалено');
  };

  return (
    <div className="adm-speakers-page">
      <AdminPageHero
        title="Спикеры"
        hint="База для программы и базы знаний: ФИО и регалии отдельно. В событиях выбирайте из списка с поиском."
      />

      <div className="card adm-forum-block">
        <h3>Добавить спикера</h3>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">ФИО</span>
            <input
              className="adm-input"
              value={newRow.name}
              onChange={e => setNewRow({ ...newRow, name: e.target.value })}
              placeholder="Иванов Иван Иванович"
            />
          </label>
          <label className="adm-field" style={{ gridColumn: '1 / -1' }}>
            <span className="adm-label">Регалии (комментарий)</span>
            <textarea
              className="adm-input"
              rows={2}
              value={newRow.credentials}
              onChange={e => setNewRow({ ...newRow, credentials: e.target.value })}
              placeholder="д.п.н., профессор МГУ, эксперт по…"
            />
          </label>
        </div>
        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" style={{ marginTop: 8 }} onClick={saveNew}>
          Сохранить
        </button>
      </div>

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
        {!loading && filtered.length === 0 && (
          <p className="adm-muted">{speakers.length === 0 ? 'Пока нет спикеров.' : 'Ничего не найдено.'}</p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="adm-speaker-table">
            <div className="adm-speaker-table-head">
              <span>ФИО</span>
              <span>Регалии</span>
              <span />
            </div>
            {filtered.map(s => (
              <div key={s.id} className={`adm-speaker-table-row ${editId === s.id ? 'editing' : ''}`}>
                {editId === s.id ? (
                  <>
                    <input
                      className="adm-input adm-input-sm"
                      value={editRow.name}
                      onChange={e => setEditRow({ ...editRow, name: e.target.value })}
                    />
                    <textarea
                      className="adm-input adm-input-sm"
                      rows={2}
                      value={editRow.credentials}
                      onChange={e => setEditRow({ ...editRow, credentials: e.target.value })}
                    />
                    <div className="adm-speaker-row-actions">
                      <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={saveEdit}>Сохранить</button>
                      <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={cancelEdit}>Отмена</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>{s.name}</strong>
                      {s.initials && <span className="adm-muted" style={{ marginLeft: 8, fontSize: 11 }}>{s.initials}</span>}
                    </div>
                    <div className="adm-speaker-cred">{s.credentials?.trim() || '—'}</div>
                    <div className="adm-speaker-row-actions">
                      <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => startEdit(s)}>Изменить</button>
                      <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => remove(s.id)}>Удалить</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && speakers.length > 0 && (
          <p className="adm-forum-hint" style={{ marginTop: 12, marginBottom: 0 }}>
            В программе и материалах отображается: {speakerFullLabel(speakers[0]!)}
            {speakers.length > 1 ? ' (и аналогично для остальных)' : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

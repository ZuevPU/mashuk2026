import { useCallback, useEffect, useState } from 'react';
import { getAdminEditingShiftId, setAdminEditingShiftId } from '../../admin/client';
import type { AdminTabProps } from '../admin/types';

type Shift = {
  id: number;
  code: string;
  name: string;
  status: string;
  isSandbox: boolean;
  startDate: string | null;
  totalDays: number | null;
  currentDay: number | null;
};

type EditDraft = {
  name: string;
  startDate: string;
  totalDays: number;
  currentDay: number;
};

type CopyDraft = {
  code: string;
  name: string;
  startDate: string;
};

type CreateDraft = {
  code: string;
  name: string;
  startDate: string;
  totalDays: number;
  isSandbox: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  ready: 'Готова',
  active: 'Активна',
  archived: 'Архив',
};

function toDateInput(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function formatDateRu(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function endDateLabel(startDate: string | null, totalDays: number | null): string {
  if (!startDate || !totalDays || totalDays < 1) return '—';
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return '—';
  d.setDate(d.getDate() + (totalDays - 1));
  return d.toLocaleDateString('ru-RU');
}

function draftFromShift(s: Shift): EditDraft {
  return {
    name: s.name || '',
    startDate: toDateInput(s.startDate),
    totalDays: s.totalDays ?? 8,
    currentDay: s.currentDay ?? 1,
  };
}

export function ShiftsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShiftId, setActiveShiftId] = useState<number | null>(null);
  const [editingShiftId, setEditingShiftIdState] = useState<number | null>(() => getAdminEditingShiftId());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyPreview, setCopyPreview] = useState<string | null>(null);
  const [copyDraft, setCopyDraft] = useState<CopyDraft | null>(null);
  const [copyIntoTargetId, setCopyIntoTargetId] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    code: '',
    name: '',
    startDate: '',
    totalDays: 8,
    isSandbox: false,
  });
  const [showCreate, setShowCreate] = useState(false);

  const setEditingContext = useCallback((id: number | null) => {
    setAdminEditingShiftId(id);
    setEditingShiftIdState(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/shifts');
      const list: Shift[] = res.shifts || [];
      const activeId: number | null = res.activeShiftId ?? null;
      setShifts(list);
      setActiveShiftId(activeId);

      const stored = getAdminEditingShiftId();
      const storedOk = stored != null && list.some(s => s.id === stored);
      const nextEdit = storedOk ? stored : (activeId ?? list[0]?.id ?? null);
      if (nextEdit !== stored) setEditingContext(nextEdit);
      else setEditingShiftIdState(nextEdit);

      setSelectedId(prev => {
        if (prev != null && list.some(s => s.id === prev)) return prev;
        return nextEdit;
      });
    } finally {
      setLoading(false);
    }
  }, [adminFetch, setEditingContext]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    const s = shifts.find(x => x.id === selectedId);
    setDraft(s ? draftFromShift(s) : null);
  }, [selectedId, shifts]);

  // Reset copy UI only when switching the selected shift, not on list reload.
  useEffect(() => {
    setCopyPreview(null);
    setCopyDraft(null);
    setCopyIntoTargetId(null);
  }, [selectedId]);

  const selected = shifts.find(s => s.id === selectedId) || null;

  const saveSelected = () => {
    if (!selected || !draft) return;
    act(async () => {
      await adminFetch(`/shifts/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          startDate: draft.startDate || null,
          totalDays: draft.totalDays,
          currentDay: draft.currentDay,
        }),
      });
      await load();
    }, 'Смена сохранена');
  };

  const activateSelected = () => {
    if (!selected) return;
    const ok = confirm(
      `Активировать смену «${selected.name}»?\n\n` +
        'Участники мини-приложения сразу увидят программу этой смены и будут регистрироваться в неё. ' +
        'Текущая активная смена будет снята с публикации для участников.',
    );
    if (!ok) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ demoteTo: 'archived' }),
      });
      setEditingContext(selected.id);
      await load();
      return res.message || 'Смена активирована';
    }, 'Смена активирована');
  };

  const archiveSelected = () => {
    if (!selected) return;
    if (!confirm(`Архивировать смену «${selected.name}»?`)) return;
    act(async () => {
      await adminFetch(`/shifts/${selected.id}/archive`, { method: 'POST', body: '{}' });
      await load();
    }, 'Смена в архиве');
  };

  const startCopy = () => {
    if (!selected) return;
    // Do not use act(): it reloads the tab and clears the copy form.
    void adminFetch(`/shifts/${selected.id}/copy-preview`)
      .then((res: { summary?: string }) => {
        setCopyPreview(res.summary || 'Предпросмотр недоступен');
        setCopyIntoTargetId(null);
        setCopyDraft({
          code: `${selected.code}-copy`,
          name: `${selected.name} (копия)`,
          startDate: toDateInput(selected.startDate),
        });
      })
      .catch((e: unknown) => alert(String(e instanceof Error ? e.message : e)));
  };

  const startCopyInto = () => {
    if (!selected) return;
    const firstTarget = shifts.find(s => s.id !== selected.id && s.status !== 'active');
    if (!firstTarget) {
      alert('Нет доступной целевой смены. Создайте пустую смену-черновик.');
      return;
    }
    // Do not use act(): reloadKey resets copyIntoTargetId via the shifts effect.
    void adminFetch(`/shifts/${selected.id}/copy-preview`)
      .then((res: { summary?: string }) => {
        setCopyPreview(res.summary || 'Предпросмотр недоступен');
        setCopyDraft(null);
        setCopyIntoTargetId(firstTarget.id);
      })
      .catch((e: unknown) => alert(String(e instanceof Error ? e.message : e)));
  };

  const confirmCopyInto = () => {
    if (!selected || copyIntoTargetId == null) return;
    const target = shifts.find(s => s.id === copyIntoTargetId);
    if (!target) return;
    const ok = confirm(
      `${copyPreview || ''}\n\n` +
      `Скопировать структуру из «${selected.name}» в «${target.name}»?\n` +
      'Целевая смена должна быть пустой. Участники и их данные не копируются.',
    );
    if (!ok) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/copy-into`, {
        method: 'POST',
        body: JSON.stringify({ targetShiftId: target.id }),
      });
      setCopyPreview(null);
      setCopyIntoTargetId(null);
      await load();
      setSelectedId(target.id);
      setEditingContext(target.id);
      return res.message;
    }, 'Структура смены скопирована');
  };

  const confirmCopy = () => {
    if (!selected || !copyDraft) return;
    if (!copyDraft.code.trim() || !copyDraft.name.trim()) {
      alert('Укажите код и название новой смены');
      return;
    }
    if (!confirm(`${copyPreview || ''}\n\nСоздать копию смены?`)) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({
          code: copyDraft.code.trim(),
          name: copyDraft.name.trim(),
          startDate: copyDraft.startDate || undefined,
        }),
      });
      setCopyPreview(null);
      setCopyDraft(null);
      await load();
      if (res.shift?.id) {
        setSelectedId(res.shift.id);
        setEditingContext(res.shift.id);
      }
    }, 'Смена скопирована');
  };

  const clearSandbox = () => {
    if (!selected?.isSandbox) return;
    const ok = confirm(
      `Очистить данные участников в песочнице «${selected.name}»?\n\n` +
        'Будут удалены ответы, баллы, посещения и связанные данные участников этой смены. Действие необратимо.',
    );
    if (!ok) return;
    act(async () => {
      await adminFetch(`/shifts/${selected.id}/clear-sandbox`, {
        method: 'POST',
        body: JSON.stringify({ confirm: 'CLEAR_SANDBOX' }),
      });
    }, 'Данные песочницы очищены');
  };

  const createShift = () => {
    if (!createDraft.code.trim() || !createDraft.name.trim()) {
      alert('Укажите код и название');
      return;
    }
    act(async () => {
      const res = await adminFetch('/shifts', {
        method: 'POST',
        body: JSON.stringify({
          code: createDraft.code.trim(),
          name: createDraft.name.trim(),
          startDate: createDraft.startDate || undefined,
          totalDays: createDraft.totalDays,
          isSandbox: createDraft.isSandbox,
        }),
      });
      setShowCreate(false);
      setCreateDraft({ code: '', name: '', startDate: '', totalDays: 8, isSandbox: false });
      await load();
      if (res.shift?.id) {
        setSelectedId(res.shift.id);
        setEditingContext(res.shift.id);
      }
    }, 'Смена создана');
  };

  if (loading && shifts.length === 0) {
    return <p className="adm-muted">Загрузка смен…</p>;
  }

  return (
    <div className="adm-forum">
      <div className="adm-forum-hero card">
        <h2 className="adm-forum-hero-title">Смены форума</h2>
        <p className="adm-forum-hint">
          Активная смена видна участникам. «Редактируем смену» задаёт контекст для вкладок «Программа», «Вопросы» и других.
        </p>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="adm-forum-inline">
            Редактируем смену
            <select
              className="adm-input"
              style={{ minWidth: 220 }}
              value={editingShiftId ?? ''}
              onChange={e => {
                const id = e.target.value ? Number(e.target.value) : null;
                setEditingContext(id);
                if (id != null) setSelectedId(id);
              }}
            >
              {shifts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}){s.id === activeShiftId ? ' · для участников' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? 'Скрыть форму' : 'Новая смена'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="card adm-forum-block">
          <h3>Новая смена</h3>
          <div className="adm-forum-grid-2">
            <label className="adm-field">
              <span className="adm-label">Код</span>
              <input
                className="adm-input"
                value={createDraft.code}
                onChange={e => setCreateDraft(d => ({ ...d, code: e.target.value }))}
                placeholder="shift-2"
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">Название</span>
              <input
                className="adm-input"
                value={createDraft.name}
                onChange={e => setCreateDraft(d => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">Дата старта</span>
              <input
                type="date"
                className="adm-input"
                value={createDraft.startDate}
                onChange={e => setCreateDraft(d => ({ ...d, startDate: e.target.value }))}
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">Всего дней</span>
              <input
                type="number"
                className="adm-input"
                min={1}
                max={14}
                value={createDraft.totalDays}
                onChange={e => setCreateDraft(d => ({ ...d, totalDays: Number(e.target.value) || 8 }))}
              />
            </label>
          </div>
          <label className="adm-forum-check" style={{ display: 'block', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={createDraft.isSandbox}
              onChange={e => setCreateDraft(d => ({ ...d, isSandbox: e.target.checked }))}
            />
            Песочница (тестовая смена)
          </label>
          <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn adm-btn-primary" onClick={createShift}>Создать</button>
          </div>
        </div>
      )}

      <div className="adm-forum-grid-2" style={{ alignItems: 'start' }}>
        <div>
          {shifts.map(s => {
            const isActive = s.id === activeShiftId || s.status === 'active';
            const isSelected = s.id === selectedId;
            const isEditingCtx = s.id === editingShiftId;
            return (
              <button
                key={s.id}
                type="button"
                className="card adm-forum-block"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--m-accent)' : undefined,
                  boxShadow: isSelected ? '0 0 0 1px var(--m-accent)' : undefined,
                }}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="adm-forum-toolbar" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong>{s.name}</strong>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`adm-program-badge adm-program-badge-${s.status === 'active' ? 'visible' : s.status === 'ready' ? 'waiting_day' : 'draft'}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                    {s.isSandbox && (
                      <span className="adm-program-badge" style={{ background: '#E9D8FD', color: '#553C9A' }}>
                        Песочница
                      </span>
                    )}
                  </span>
                </div>
                <div className="adm-muted" style={{ fontSize: 12 }}>
                  код: {s.code}
                </div>
                <div className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {formatDateRu(s.startDate)} — {endDateLabel(s.startDate, s.totalDays)} · день {s.currentDay ?? 1}/{s.totalDays ?? 8}
                </div>
                {isActive && (
                  <p className="adm-forum-hint" style={{ marginTop: 8, marginBottom: 0, color: '#276749' }}>
                    Видна участникам
                  </p>
                )}
                {isEditingCtx && !isActive && (
                  <p className="adm-forum-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                    Контекст редактирования
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <div className="card adm-forum-block">
          {!selected || !draft ? (
            <p className="adm-muted">Выберите смену слева</p>
          ) : (
            <>
              <h3>{selected.name}</h3>
              <p className="adm-forum-hint">Код: {selected.code}</p>
              <div className="adm-forum-grid-2">
                <label className="adm-field">
                  <span className="adm-label">Название</span>
                  <input
                    className="adm-input"
                    value={draft.name}
                    onChange={e => setDraft(d => (d ? { ...d, name: e.target.value } : d))}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Дата старта</span>
                  <input
                    type="date"
                    className="adm-input"
                    value={draft.startDate}
                    onChange={e => setDraft(d => (d ? { ...d, startDate: e.target.value } : d))}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Всего дней</span>
                  <input
                    type="number"
                    className="adm-input"
                    min={1}
                    max={14}
                    value={draft.totalDays}
                    onChange={e => setDraft(d => (d ? { ...d, totalDays: Number(e.target.value) || 8 } : d))}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-label">Текущий день</span>
                  <input
                    type="number"
                    className="adm-input"
                    min={1}
                    max={draft.totalDays || 14}
                    value={draft.currentDay}
                    onChange={e => setDraft(d => (d ? { ...d, currentDay: Number(e.target.value) || 1 } : d))}
                  />
                </label>
              </div>

              <div className="adm-forum-toolbar" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="adm-btn adm-btn-primary" onClick={saveSelected}>
                  Сохранить
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => {
                    setEditingContext(selected.id);
                  }}
                >
                  Редактируем эту смену
                </button>
                {selected.status !== 'active' && (
                  <button type="button" className="adm-btn adm-btn-primary" onClick={activateSelected}>
                    Активировать
                  </button>
                )}
                {selected.status !== 'archived' && selected.status !== 'active' && (
                  <button type="button" className="adm-btn adm-btn-secondary" onClick={archiveSelected}>
                    Архивировать
                  </button>
                )}
                <button type="button" className="adm-btn adm-btn-secondary" onClick={startCopy}>
                  Копировать в новую смену
                </button>
                <button type="button" className="adm-btn adm-btn-secondary" onClick={startCopyInto}>
                  Копировать в смену…
                </button>
                {selected.isSandbox && (
                  <button type="button" className="adm-btn adm-btn-danger" onClick={clearSandbox}>
                    Очистить данные участников
                  </button>
                )}
              </div>

              {copyDraft && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--m-border)' }}>
                  <h4>Копия смены</h4>
                  {copyPreview && <p className="adm-forum-hint">{copyPreview}</p>}
                  <div className="adm-forum-grid-2">
                    <label className="adm-field">
                      <span className="adm-label">Код новой смены</span>
                      <input
                        className="adm-input"
                        value={copyDraft.code}
                        onChange={e => setCopyDraft(d => (d ? { ...d, code: e.target.value } : d))}
                      />
                    </label>
                    <label className="adm-field">
                      <span className="adm-label">Название</span>
                      <input
                        className="adm-input"
                        value={copyDraft.name}
                        onChange={e => setCopyDraft(d => (d ? { ...d, name: e.target.value } : d))}
                      />
                    </label>
                    <label className="adm-field">
                      <span className="adm-label">Дата старта</span>
                      <input
                        type="date"
                        className="adm-input"
                        value={copyDraft.startDate}
                        onChange={e => setCopyDraft(d => (d ? { ...d, startDate: e.target.value } : d))}
                      />
                    </label>
                  </div>
                  <div className="adm-forum-toolbar" style={{ marginTop: 12, gap: 8 }}>
                    <button type="button" className="adm-btn adm-btn-primary" onClick={confirmCopy}>
                      Создать копию
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      onClick={() => {
                        setCopyDraft(null);
                        setCopyPreview(null);
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {copyIntoTargetId != null && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--m-border)' }}>
                  <h4>Копировать в существующую смену</h4>
                  {copyPreview && <p className="adm-forum-hint">{copyPreview}</p>}
                  <p className="adm-forum-hint">
                    Копирование доступно только в пустую неактивную смену. Участники, ответы, баллы и посещения не переносятся.
                  </p>
                  <label className="adm-field">
                    <span className="adm-label">Целевая смена</span>
                    <select
                      className="adm-input"
                      value={copyIntoTargetId}
                      onChange={e => setCopyIntoTargetId(Number(e.target.value))}
                    >
                      {shifts
                        .filter(s => s.id !== selected.id && s.status !== 'active')
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code}) · {STATUS_LABELS[s.status] || s.status}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="adm-forum-toolbar" style={{ marginTop: 12, gap: 8 }}>
                    <button type="button" className="adm-btn adm-btn-primary" onClick={confirmCopyInto}>
                      Копировать
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      onClick={() => {
                        setCopyIntoTargetId(null);
                        setCopyPreview(null);
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

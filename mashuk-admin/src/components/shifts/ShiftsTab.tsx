import { useCallback, useEffect, useState } from 'react';
import { getAdminEditingShiftId, setAdminEditingShiftId } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';

const SHIFTS_NAV: HubNavItem[] = [
  { id: 'shifts-hero', label: 'Обзор' },
  { id: 'shifts-create', label: 'Новая' },
  { id: 'shifts-list', label: 'Список' },
  { id: 'shifts-edit', label: 'Карточка' },
];

type Shift = {
  id: number;
  code: string;
  name: string;
  status: string;
  isPublished?: boolean;
  isSandbox: boolean;
  startDate: string | null;
  totalDays: number | null;
  currentDay: number | null;
};

type CopyModule = 'forum' | 'program' | 'knowledge' | 'tasks' | 'questions' | 'points' | 'medals' | 'groups' | 'pushes';

const COPY_MODULES: { id: CopyModule; label: string }[] = [
  { id: 'forum', label: 'Форум' },
  { id: 'program', label: 'Программа' },
  { id: 'knowledge', label: 'База знаний' },
  { id: 'tasks', label: 'Задания' },
  { id: 'questions', label: 'Вопросы' },
  { id: 'points', label: 'Система баллов' },
  { id: 'medals', label: 'Медали' },
  { id: 'groups', label: 'Группы' },
  { id: 'pushes', label: 'Рассылки' },
];

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
  const [copyModules, setCopyModules] = useState<CopyModule[]>(COPY_MODULES.map(m => m.id));
  const [alreadyCopied, setAlreadyCopied] = useState<CopyModule[]>([]);
  const [targetCounts, setTargetCounts] = useState<Record<string, number> | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
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
    setCopyModules(COPY_MODULES.map(m => m.id));
    setAlreadyCopied([]);
    setTargetCounts(null);
    setConfirmReplace(false);
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
        'Участники этой смены увидят программу, задания и вопросы. Другие активные смены не снимаются.',
    );
    if (!ok) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/activate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setEditingContext(selected.id);
      await load();
      return res.message || 'Смена активирована';
    }, 'Смена активирована');
  };

  const publishSelected = () => {
    if (!selected) return;
    const ok = confirm(
      `Опубликовать смену «${selected.name}»?\n\n` +
        'Участники смогут регистрироваться на эту смену. Другие активные смены не снимаются.',
    );
    if (!ok) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/publish`, { method: 'POST', body: '{}' });
      await load();
      return res.message || 'Смена опубликована';
    }, 'Смена опубликована');
  };

  const unpublishSelected = () => {
    if (!selected) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/unpublish`, { method: 'POST', body: '{}' });
      await load();
      return res.message || 'Публикация снята';
    }, 'Публикация снята');
  };

  const deactivateSelected = () => {
    if (!selected) return;
    if (!confirm(`Снять активность смены «${selected.name}»? Программа для её участников станет пустой.`)) return;
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/deactivate`, { method: 'POST', body: '{}' });
      await load();
      return res.message || 'Активность снята';
    }, 'Активность снята');
  };

  const archiveSelected = () => {
    if (!selected) return;
    if (!confirm(`Архивировать смену «${selected.name}»?`)) return;
    act(async () => {
      await adminFetch(`/shifts/${selected.id}/archive`, { method: 'POST', body: '{}' });
      await load();
    }, 'Смена в архиве');
  };

  const applyCopyPreview = (res: {
    summary?: string;
    alreadyCopied?: CopyModule[];
    targetCounts?: Record<string, number> | null;
  }) => {
    setCopyPreview(res.summary || 'Предпросмотр недоступен');
    const counts = res.targetCounts ?? null;
    // Empty previous copy (0 rows) must stay selectable — otherwise medals never recopy.
    const locked = (res.alreadyCopied || []).filter((m): m is CopyModule =>
      COPY_MODULES.some(x => x.id === m) && (counts?.[m] ?? 0) > 0,
    );
    setAlreadyCopied(locked);
    setTargetCounts(counts);
    setCopyModules(COPY_MODULES.map(m => m.id).filter(id => !locked.includes(id)));
    setConfirmReplace(false);
  };

  const startCopy = () => {
    if (!selected) return;
    void adminFetch(`/shifts/${selected.id}/copy-preview`)
      .then((res: { summary?: string; alreadyCopied?: CopyModule[]; targetCounts?: Record<string, number> | null }) => {
        applyCopyPreview(res);
        setCopyIntoTargetId(null);
        setCopyDraft({
          code: '',
          name: `${selected.name} (копия)`,
          startDate: toDateInput(selected.startDate),
        });
      })
      .catch((e: unknown) => alert(String(e instanceof Error ? e.message : e)));
  };

  const startCopyInto = () => {
    if (!selected) return;
    const firstTarget = shifts.find(s => s.id !== selected.id);
    if (!firstTarget) {
      alert('Нет доступной целевой смены. Создайте пустую смену-черновик.');
      return;
    }
    void adminFetch(`/shifts/${selected.id}/copy-preview?targetShiftId=${firstTarget.id}`)
      .then((res: { summary?: string; alreadyCopied?: CopyModule[]; targetCounts?: Record<string, number> | null }) => {
        applyCopyPreview(res);
        setCopyDraft(null);
        setCopyIntoTargetId(firstTarget.id);
      })
      .catch((e: unknown) => alert(String(e instanceof Error ? e.message : e)));
  };

  const reloadCopyPreviewForTarget = (targetId: number) => {
    if (!selected) return;
    void adminFetch(`/shifts/${selected.id}/copy-preview?targetShiftId=${targetId}`)
      .then((res: { summary?: string; alreadyCopied?: CopyModule[]; targetCounts?: Record<string, number> | null }) => {
        applyCopyPreview(res);
        setCopyIntoTargetId(targetId);
      })
      .catch((e: unknown) => alert(String(e instanceof Error ? e.message : e)));
  };

  const occupiedSelected = copyModules.filter(m => (targetCounts?.[m] ?? 0) > 0 && !alreadyCopied.includes(m));

  const confirmCopyInto = () => {
    if (!selected || copyIntoTargetId == null) return;
    const target = shifts.find(s => s.id === copyIntoTargetId);
    if (!target) return;
    if (!copyModules.length) {
      alert('Выберите хотя бы один блок');
      return;
    }
    if (occupiedSelected.length && !confirmReplace) {
      alert('Подтвердите замену данных в целевой смене');
      return;
    }
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/copy-into`, {
        method: 'POST',
        body: JSON.stringify({
          targetShiftId: target.id,
          modules: copyModules,
          confirmReplace: occupiedSelected.length > 0,
        }),
      });
      setCopyPreview(null);
      setCopyIntoTargetId(null);
      await load();
      setSelectedId(target.id);
      setEditingContext(target.id);
      return `${res.message || 'Структура скопирована'}. Онбординг и вечерняя анкета скопированы — проверьте их перед публикацией.`;
    }, 'Структура смены скопирована');
  };

  const confirmCopy = () => {
    if (!selected || !copyDraft) return;
    if (!copyDraft.name.trim()) {
      alert('Укажите название новой смены');
      return;
    }
    if (!copyModules.length) {
      alert('Выберите хотя бы один блок');
      return;
    }
    act(async () => {
      const res = await adminFetch(`/shifts/${selected.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({
          code: copyDraft.code.trim() || undefined,
          name: copyDraft.name.trim(),
          startDate: copyDraft.startDate || undefined,
          modules: copyModules,
        }),
      });
      setCopyPreview(null);
      setCopyDraft(null);
      await load();
      if (res.shift?.id) {
        setSelectedId(res.shift.id);
        setEditingContext(res.shift.id);
      }
      return `${res.message || 'Смена скопирована'}. Онбординг и вечерняя анкета скопированы — проверьте их перед публикацией.`;
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
    if (!createDraft.name.trim()) {
      alert('Укажите название');
      return;
    }
    act(async () => {
      const res = await adminFetch('/shifts', {
        method: 'POST',
        body: JSON.stringify({
          name: createDraft.name.trim(),
          startDate: createDraft.startDate || undefined,
          totalDays: createDraft.totalDays,
          isSandbox: createDraft.isSandbox,
        }),
      });
      setShowCreate(false);
      setCreateDraft({ name: '', startDate: '', totalDays: 8, isSandbox: false });
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

  const renderCopyModules = () => (
    <div style={{ marginTop: 12 }}>
      <p className="adm-label">Блоки для переноса</p>
      <label className="adm-forum-check" style={{ display: 'block', opacity: 0.55 }}>
        <input type="checkbox" disabled checked={false} readOnly />
        Спикеры — общий справочник, уже доступен
      </label>
      {COPY_MODULES.map(m => {
        const locked = alreadyCopied.includes(m.id);
        const occupied = (targetCounts?.[m.id] ?? 0) > 0;
        return (
          <label key={m.id} className="adm-forum-check" style={{ display: 'block', opacity: locked ? 0.55 : 1 }}>
            <input
              type="checkbox"
              disabled={locked}
              checked={!locked && copyModules.includes(m.id)}
              onChange={e => {
                setCopyModules(prev => (e.target.checked
                  ? [...prev, m.id]
                  : prev.filter(id => id !== m.id)));
              }}
            />
            {m.label}
            {locked ? ' — заблокировано, уже перенесено' : occupied ? ' — в цели есть данные' : ''}
          </label>
        );
      })}
      {occupiedSelected.length > 0 && (
        <>
          <p className="adm-forum-hint" style={{ color: '#C62828' }}>
            Данные смены «{shifts.find(s => s.id === copyIntoTargetId)?.name || 'цели'}» по выбранным блокам будут заменены данными из «{selected?.name}».
            База знаний цели не удаляется — старые материалы уходят в архив этой же смены.
          </p>
          <label className="adm-forum-check" style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={e => setConfirmReplace(e.target.checked)}
            />
            Подтверждаю замену
          </label>
        </>
      )}
    </div>
  );

  return (
    <HubLensLayout className="adm-forum adm-kb" items={SHIFTS_NAV} navLabel="Разделы смен">
      <section id="shifts-hero" className="adm-forum-anchor">
        <AdminPageHero
          title="Смены форума"
          hint="Опубликованная смена доступна для регистрации. Активная смена показывает программу участникам. Несколько смен могут быть активны одновременно."
        >
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
                    {s.name} ({s.code}){s.status === 'active' ? ' · активна' : s.isPublished ? ' · опубликована' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setShowCreate(v => !v)}>
              {showCreate ? 'Скрыть форму' : 'Новая смена'}
            </button>
          </div>
        </AdminPageHero>
      </section>

      {showCreate && (
        <section id="shifts-create" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Новая смена</h3>
            <p className="adm-kb-panel-sub">Название, дата старта и число дней. Код смены создаётся автоматически.</p>
          </div>
          <div className="adm-forum-grid-2">
            <label className="adm-field">
              <span className="adm-label">Название</span>
              <input
                className="adm-input"
                value={createDraft.name}
                onChange={e => setCreateDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Смена 16 августа"
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
        </section>
      )}

      <div className="adm-forum-grid-2" style={{ alignItems: 'start' }}>
        <section id="shifts-list" className="adm-forum-anchor">
          {shifts.map(s => {
            const isActive = s.id === activeShiftId || s.status === 'active';
            const isSelected = s.id === selectedId;
            const isEditingCtx = s.id === editingShiftId;
            return (
              <button
                key={s.id}
                type="button"
                className={`card adm-forum-block adm-kb-panel adm-shifts-pick${isSelected ? ' is-on' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="adm-forum-toolbar" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong>{s.name}</strong>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`adm-program-badge adm-program-badge-${s.status === 'active' ? 'visible' : s.status === 'ready' ? 'waiting_day' : 'draft'}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                    {s.isPublished && s.status !== 'active' && (
                      <span className="adm-program-badge adm-program-badge-waiting_day">Опубликована</span>
                    )}
                    {s.isSandbox && (
                      <span className="adm-program-badge adm-shifts-sandbox-badge">
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
                  <p className="adm-kb-panel-sub" style={{ marginTop: 8, color: '#34C759' }}>
                    Программа открыта участникам
                  </p>
                )}
                {s.isPublished && !isActive && (
                  <p className="adm-kb-panel-sub" style={{ marginTop: 8, color: '#007AFF' }}>
                    Можно регистрироваться · программа пока пустая
                  </p>
                )}
                {isEditingCtx && !isActive && (
                  <p className="adm-kb-panel-sub" style={{ marginTop: 8 }}>
                    Контекст редактирования
                  </p>
                )}
              </button>
            );
          })}
        </section>

        <section id="shifts-edit" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          {!selected || !draft ? (
            <p className="adm-muted">Выберите смену слева</p>
          ) : (
            <>
              <div className="adm-kb-panel-head">
                <h3>{selected.name}</h3>
                <p className="adm-kb-panel-sub">Код: {selected.code}</p>
              </div>
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
                {!selected.isPublished && selected.status !== 'archived' && (
                  <button type="button" className="adm-btn adm-btn-secondary" onClick={publishSelected}>
                    Опубликовать
                  </button>
                )}
                {selected.isPublished && selected.status !== 'active' && (
                  <button type="button" className="adm-btn adm-btn-secondary" onClick={unpublishSelected}>
                    Снять публикацию
                  </button>
                )}
                {selected.status !== 'active' && selected.status !== 'archived' && (
                  <button type="button" className="adm-btn adm-btn-primary" onClick={activateSelected}>
                    Активировать
                  </button>
                )}
                {selected.status === 'active' && (
                  <button type="button" className="adm-btn adm-btn-secondary" onClick={deactivateSelected}>
                    Снять активность
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
                  {renderCopyModules()}
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
                    Участники, ответы и баллы людей не копируются. Уже перенесённые блоки заблокированы.
                  </p>
                  <label className="adm-field">
                    <span className="adm-label">Целевая смена</span>
                    <select
                      className="adm-input"
                      value={copyIntoTargetId}
                      onChange={e => reloadCopyPreviewForTarget(Number(e.target.value))}
                    >
                      {shifts
                        .filter(s => s.id !== selected.id)
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code}) · {STATUS_LABELS[s.status] || s.status}
                          </option>
                        ))}
                    </select>
                  </label>
                  {renderCopyModules()}
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
        </section>
      </div>
    </HubLensLayout>
  );
}

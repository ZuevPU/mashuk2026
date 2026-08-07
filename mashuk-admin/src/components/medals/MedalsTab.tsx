import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { MedalForm } from './MedalForm';
import { MedalsListTable } from './MedalsListTable';
import {
  bodyFromDraft,
  buildMedalsQuery,
  draftFromMedal,
  emptyMedalDraft,
  type ListTab,
  type Medal,
  type MedalDraft,
  type RuleMetricOption,
} from './types';

export function MedalsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [medals, setMedals] = useState<Medal[]>([]);
  const [listCount, setListCount] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [metrics, setMetrics] = useState<RuleMetricOption[]>([]);
  const [tab, setTab] = useState<ListTab>('active');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [awardFilter, setAwardFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MedalDraft>(() => emptyMedalDraft());
  const [saving, setSaving] = useState(false);

  const listQuery = useMemo(
    () => buildMedalsQuery({
      tab,
      category: categoryFilter,
      level: levelFilter,
      awardType: awardFilter,
      visibility: visibilityFilter,
    }),
    [tab, categoryFilter, levelFilter, awardFilter, visibilityFilter],
  );

  const loadMeta = useCallback(async () => {
    const mRes = await adminFetch('/medals/rule-metrics');
    const list = mRes.metrics || [];
    setMetrics(list);
    const allRes = await adminFetch('/medals');
    setTotalAll(allRes.totalCount ?? (allRes.medals?.length || 0));
    return list[0]?.key || 'tasks_completed';
  }, [adminFetch]);

  const loadMedals = useCallback(async () => {
    const res = await adminFetch(`/medals?${listQuery}`);
    setMedals(res.medals || []);
    setListCount(res.totalCount ?? (res.medals?.length || 0));
  }, [adminFetch, listQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadMeta();
      await loadMedals();
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadMedals]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const openCreate = async () => {
    const defaultMetric = (await loadMeta()) as string;
    setEditingId(null);
    setDraft({ ...emptyMedalDraft(), ruleMetric: defaultMetric });
    setView('form');
  };

  const openEdit = (m: Medal) => {
    const defaultMetric = metrics[0]?.key || 'tasks_completed';
    setEditingId(m.id);
    setDraft(draftFromMedal(m, defaultMetric));
    setView('form');
  };

  const save = () => {
    if (!draft.name.trim()) {
      void act(async () => { throw new Error('Укажите название медали'); }, '');
      return;
    }
    if (draft.awardType === 'auto' && (!draft.ruleMetric || draft.ruleValue < 1)) {
      void act(async () => { throw new Error('Для автоматической медали укажите метрику и порог ≥ 1'); }, '');
      return;
    }
    setSaving(true);
    act(async () => {
      try {
        const body = bodyFromDraft(draft);
        if (editingId) {
          await adminFetch(`/medals/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
        } else {
          await adminFetch('/medals', { method: 'POST', body: JSON.stringify(body) });
        }
        setView('list');
        await load();
      } finally {
        setSaving(false);
      }
    }, editingId ? 'Медаль сохранена' : 'Медаль создана');
  };

  const hideMedal = (m: Medal) =>
    act(async () => {
      await adminFetch(`/medals/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibility: 'hidden' }),
      });
      await load();
    }, 'Видимость: скрытая');

  const deleteMedal = (id: number) => {
    if (!confirmDelete()) return;
    act(async () => {
      await adminFetch(`/medals/${id}`, { method: 'DELETE' });
      await load();
    }, 'Удалено');
  };

  const runEvaluate = () =>
    act(async () => {
      await adminFetch('/medals/evaluate', { method: 'POST' });
      await load();
    }, 'Авто-оценка запущена');

  if (loading && view === 'list') {
    return <p className="adm-muted">Загрузка медалей…</p>;
  }

  if (view === 'form') {
    return (
      <div className="adm-forum">
        <AdminPageHero title={editingId ? 'Редактирование медали' : 'Новая медаль'} />
        <MedalForm
          draft={draft}
          metrics={metrics}
          editing={!!editingId}
          editingKey={editingId ?? 'new'}
          saving={saving}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          onSave={save}
          onBack={() => setView('list')}
          onEvaluate={runEvaluate}
          adminFetch={adminFetch}
          act={act}
        />
      </div>
    );
  }

  const tabs: { key: ListTab; label: string }[] = [
    { key: 'active', label: 'Активные' },
    { key: 'drafts', label: 'Черновики' },
  ];

  const hasListFilters = categoryFilter || levelFilter || awardFilter || visibilityFilter;
  const heroTitle = hasListFilters || tab === 'drafts'
    ? `Медали · ${listCount} в списке · ${totalAll} всего`
    : `Медали · ${totalAll} всего`;

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={heroTitle}
        hint="Каталог наград смены. Автоматические медали проверяются по правилам; ручные выдаются из карточки участника."
      >
        <div className="adm-seg" style={{ marginBottom: 12 }}>
          {tabs.map(t => (
            <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <select className="adm-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Категория</option>
            <option value="tasks">Задания</option>
            <option value="piggybank">Копилка</option>
            <option value="reflection">Рефлексия</option>
            <option value="points">Баллы</option>
            <option value="program">Программа</option>
            <option value="exchange">Обмен</option>
          </select>
          <select className="adm-input" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
            <option value="">Уровень</option>
            <option value="bronze">Бронза</option>
            <option value="silver">Серебро</option>
            <option value="gold">Золото</option>
          </select>
          <select className="adm-input" value={awardFilter} onChange={e => setAwardFilter(e.target.value)}>
            <option value="">Тип выдачи</option>
            <option value="auto">Автоматическая</option>
            <option value="manual">Ручная</option>
          </select>
          <select className="adm-input" value={visibilityFilter} onChange={e => setVisibilityFilter(e.target.value)}>
            <option value="">Видимость</option>
            <option value="open">Открытая</option>
            <option value="hidden">Скрытая</option>
          </select>
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={openCreate}>
            + Создать медаль
          </button>
        </div>
      </AdminPageHero>

      <div className="card">
        <MedalsListTable medals={medals} onEdit={openEdit} onHide={hideMedal} onDelete={deleteMedal} />
      </div>
    </div>
  );
}

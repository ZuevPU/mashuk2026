import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { adminFetchHtml } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import type { ProgramPlace } from '../program/types';
import { TaskCategoriesBlock } from './TaskCategoriesBlock';
import { TaskForm } from './TaskForm';
import { TaskSubmissionsModeration } from './TaskSubmissionsModeration';
import { TasksListTable } from './TasksListTable';
import {
  CONFIRMATION_METHOD_OPTIONS,
  draftFromTask,
  emptyDraft,
  patchBodyFromDraft,
  type AdminTask,
  type TaskCategory,
  type TaskDraft,
  type MedalOption,
} from './types';

type ListTab = 'active' | 'drafts' | 'archive';

function buildListQuery(params: {
  tab: ListTab;
  q: string;
  categoryId: string;
  day: string;
  confirmationMethod: string;
}): string {
  const sp = new URLSearchParams();
  if (params.tab === 'active') sp.set('status', 'published');
  if (params.tab === 'drafts') sp.set('status', 'draft');
  if (params.tab === 'archive') sp.set('status', 'archived');
  if (params.tab === 'active') sp.set('includeHidden', 'false');
  if (params.q.trim()) sp.set('q', params.q.trim());
  if (params.categoryId) sp.set('categoryId', params.categoryId);
  if (params.day) sp.set('day', params.day);
  if (params.confirmationMethod) sp.set('confirmationMethod', params.confirmationMethod);
  return sp.toString();
}

export function TasksTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [totalAll, setTotalAll] = useState(0);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [medals, setMedals] = useState<MedalOption[]>([]);
  const [places, setPlaces] = useState<ProgramPlace[]>([]);
  const [totalDays, setTotalDays] = useState(8);
  const [forumDay, setForumDay] = useState(1);

  const [tab, setTab] = useState<ListTab>('active');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategories, setShowCategories] = useState(false);

  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(1));
  const [showPreview, setShowPreview] = useState(false);
  const [moderatingTask, setModeratingTask] = useState<AdminTask | null>(null);

  const listQuery = useMemo(
    () => buildListQuery({ tab, q: search, categoryId: categoryFilter, day: dayFilter, confirmationMethod: methodFilter }),
    [tab, search, categoryFilter, dayFilter, methodFilter],
  );

  const listQueryHasFilters = useMemo(
    () => Boolean(
      search.trim()
      || categoryFilter
      || dayFilter
      || methodFilter
      || tab !== 'active',
    ),
    [search, categoryFilter, dayFilter, methodFilter, tab],
  );

  const categoriesById = useMemo(
    () => new Map(categories.map(c => [c.id, c.name])),
    [categories],
  );

  const loadMeta = useCallback(async () => {
    const fs = (await adminFetch('/forum-settings')).settings;
    const td = fs?.totalDays ?? 8;
    const cd = fs?.currentDay ?? 1;
    setTotalDays(td);
    setForumDay(cd);
    setCategories((await adminFetch('/task-categories')).categories || []);
    setMedals(((await adminFetch('/medals')).medals || []).map((m: { id: number; name: string; level?: string }) => ({
      id: m.id,
      name: m.name,
      level: m.level ?? null,
    })));
    setPlaces((await adminFetch('/program-places')).places || []);
    const allRes = await adminFetch('/tasks');
    setTotalAll(allRes.totalCount ?? (allRes.tasks?.length || 0));
    return { td, cd };
  }, [adminFetch]);

  const loadTasks = useCallback(async () => {
    const res = await adminFetch(`/tasks?${listQuery}`);
    setTasks(res.tasks || []);
  }, [adminFetch, listQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadMeta();
      await loadTasks();
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadTasks]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const openCreate = async () => {
    const meta = await loadMeta();
    setEditingId(null);
    setDraft(emptyDraft(meta.cd));
    setShowPreview(false);
    setView('form');
  };

  const openEdit = (t: AdminTask) => {
    setEditingId(t.id);
    setDraft(draftFromTask(t));
    setShowPreview(false);
    setView('form');
  };

  const persist = (publish: boolean) => {
    if (!draft.title.trim()) {
      alert('Укажите название задания.');
      return;
    }
    act(async () => {
      const body = patchBodyFromDraft(draft, publish);
      if (editingId) {
        await adminFetch(`/tasks/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        const created = await adminFetch('/tasks', { method: 'POST', body: JSON.stringify(body) });
        setEditingId(created.task?.id ?? null);
        if (created.task) setDraft(draftFromTask(created.task));
      }
      await loadTasks();
      if (publish) {
        setView('list');
        setEditingId(null);
      }
    }, publish ? 'Опубликовано' : 'Сохранено');
  };

  const duplicateTask = (id: number) =>
    act(async () => {
      const r = await adminFetch(`/tasks/${id}/duplicate`, { method: 'POST', body: '{}' });
      await loadTasks();
      if (r.task) openEdit(r.task);
    }, 'Копия создана');

  const hideTask = (id: number) =>
    act(async () => {
      await adminFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ isHidden: true }) });
      await loadTasks();
    }, 'Скрыто');

  const archiveTask = (id: number) =>
    act(async () => {
      await adminFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
      await loadTasks();
    }, 'В архиве');

  const deleteTask = (id: number) => {
    if (!confirmDelete()) return;
    act(async () => {
      await adminFetch(`/tasks/${id}`, { method: 'DELETE' });
      await loadTasks();
    }, 'Удалено');
  };

  const qrTask = (id: number) =>
    act(async () => {
      const r = await adminFetch('/qr/download', { method: 'POST', body: JSON.stringify({ type: 'task', id }) });
      if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
    }, 'QR готов');

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    act(async () => {
      await adminFetch('/task-categories', { method: 'POST', body: JSON.stringify({ name }) });
      setNewCategoryName('');
      setCategories((await adminFetch('/task-categories')).categories || []);
    }, 'Категория добавлена');
  };

  const deleteCategory = (id: number) => {
    if (!confirmDelete()) return;
    act(async () => {
      await adminFetch(`/task-categories/${id}`, { method: 'DELETE' });
      setCategories((await adminFetch('/task-categories')).categories || []);
    }, 'Удалено');
  };

  const openQrPack = () =>
    act(async () => {
      const html = await adminFetchHtml(`/qr/pack?day=${forumDay}`);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    }, 'QR для печати');

  if (loading && view === 'list' && tasks.length === 0) {
    return <p className="adm-muted">Загрузка заданий…</p>;
  }

  if (view === 'form') {
    return (
      <div className="adm-forum adm-tasks">
        <TaskForm
          draft={draft}
          categories={categories}
          places={places}
          medals={medals}
          totalDays={totalDays}
          isNew={!editingId}
          editingKey={editingId ?? 'new'}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          onSave={() => persist(false)}
          onPublish={() => persist(true)}
          onDuplicate={editingId ? () => duplicateTask(editingId) : undefined}
          onCancel={() => { setView('list'); setEditingId(null); }}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(v => !v)}
        />
      </div>
    );
  }

  const tabs: { key: ListTab; label: string }[] = [
    { key: 'active', label: 'Активные' },
    { key: 'drafts', label: 'Черновики' },
    { key: 'archive', label: 'Архив' },
  ];

  return (
    <div className="adm-forum adm-tasks">
      <AdminPageHero
        title={
          listQueryHasFilters
            ? `Задания · ${tasks.length} в списке · ${totalAll} всего`
            : `Задания · ${totalAll} всего`
        }
        hint="Список заданий форума. Справочник категорий — ниже. Проверка ответов играпрактиком — в меню строки."
      >
        <div className="adm-seg" style={{ marginBottom: 12 }}>
          {tabs.map(t => (
            <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="adm-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            style={{ flex: 1, minWidth: 160 }}
          />
          <select className="adm-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Все категории</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="adm-input" value={dayFilter} onChange={e => setDayFilter(e.target.value)}>
            <option value="">Все дни</option>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
          <select className="adm-input" value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
            <option value="">Способ подтверждения</option>
            {CONFIRMATION_METHOD_OPTIONS.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={openCreate}>
            + Создать задание
          </button>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={openQrPack}>
            Пакет QR (день {forumDay})
          </button>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setShowCategories(v => !v)}>
            {showCategories ? 'Скрыть категории' : 'Категории'}
          </button>
        </div>
      </AdminPageHero>

      {showCategories && (
        <TaskCategoriesBlock
          categories={categories}
          newName={newCategoryName}
          onNewNameChange={setNewCategoryName}
          onAdd={addCategory}
          onDelete={deleteCategory}
        />
      )}

      <div className="card">
        <TasksListTable
          tasks={tasks}
          categoriesById={categoriesById}
          onEdit={openEdit}
          onDuplicate={duplicateTask}
          onQr={qrTask}
          onHide={hideTask}
          onArchive={archiveTask}
          onDelete={deleteTask}
          onModerate={setModeratingTask}
        />
      </div>

      {moderatingTask && (
        <TaskSubmissionsModeration
          taskId={moderatingTask.id}
          taskTitle={moderatingTask.title}
          adminFetch={adminFetch}
          act={act}
          onClose={() => setModeratingTask(null)}
        />
      )}
    </div>
  );
}

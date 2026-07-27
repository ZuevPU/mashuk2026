import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetchHtml } from '../../admin/client';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import { EnumOptions } from '../admin/EnumOptions';
import type { AdminTabProps } from '../admin/types';
import { TaskCard } from './TaskCard';
import {
  draftFromTask,
  emptyNewTask,
  patchBodyFromDraft,
  type AdminTask,
  type NewTaskForm,
  type TaskDraft,
} from './types';

export function TasksTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [totalDays, setTotalDays] = useState(8);
  const [selectedDay, setSelectedDay] = useState(1);
  const [search, setSearch] = useState('');
  const [newTask, setNewTask] = useState<NewTaskForm>(() => emptyNewTask(1));
  const [drafts, setDrafts] = useState<Record<number, TaskDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fs = (await adminFetch('/forum-settings')).settings;
      const td = fs?.totalDays ?? 8;
      const cd = fs?.currentDay ?? 1;
      setTotalDays(td);
      setSelectedDay(cd);
      setNewTask(emptyNewTask(cd));
      const list = ((await adminFetch('/tasks')).tasks || []) as AdminTask[];
      setTasks(list);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    setDrafts(Object.fromEntries(tasks.map(t => [t.id, draftFromTask(t)])));
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if ((t.dayNumber ?? 1) !== selectedDay) return false;
      if (!q) return true;
      const hay = `${t.title || ''} ${t.category || ''} ${t.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, selectedDay, search]);

  useEffect(() => {
    setNewTask(f => ({ ...f, dayNumber: selectedDay }));
  }, [selectedDay]);

  const openQrPack = () =>
    act(async () => {
      const html = await adminFetchHtml(`/qr/pack?day=${selectedDay}`);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    }, 'QR для печати');

  const createTask = () => {
    if (!newTask.title.trim()) {
      alert('Укажите название задания.');
      return;
    }
    act(async () => {
      await adminFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...newTask,
          title: newTask.title.trim(),
          publishTime: new Date(),
          dayNumber: Number(newTask.dayNumber),
        }),
      });
      setNewTask(emptyNewTask(selectedDay));
      const list = ((await adminFetch('/tasks')).tasks || []) as AdminTask[];
      setTasks(list);
    }, 'Задание создано');
  };

  const saveTask = (t: AdminTask) => {
    const draft = drafts[t.id];
    if (!draft) return;
    act(async () => {
      await adminFetch(`/tasks/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBodyFromDraft(draft)),
      });
      const list = ((await adminFetch('/tasks')).tasks || []) as AdminTask[];
      setTasks(list);
    }, 'Сохранено');
  };

  const deleteTask = (id: number) =>
    act(async () => {
      await adminFetch(`/tasks/${id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== id));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 'Удалено');

  const qrTask = (id: number) =>
    act(async () => {
      const r = await adminFetch('/qr/download', {
        method: 'POST',
        body: JSON.stringify({ type: 'task', id }),
      });
      if (r.qrImageUrl) window.open(r.qrImageUrl, '_blank');
    }, 'QR готов');

  if (loading) return <p className="adm-muted">Загрузка заданий…</p>;

  return (
    <div className="adm-forum adm-tasks">
      <AdminPageHero
        title={`Задания: день ${selectedDay}`}
        hint="Редактирование заданий форума. Пакет QR — все коды заданий выбранного дня для печати."
      >
        <div className="adm-seg adm-forum-day-seg">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
            <button key={d} type="button" className={selectedDay === d ? 'on' : ''} onClick={() => setSelectedDay(d)}>
              {d}
            </button>
          ))}
        </div>
        <div className="adm-forum-toolbar" style={{ marginTop: 12 }}>
          <input
            className="adm-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, категории…"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={openQrPack}>
            Пакет QR (день {selectedDay})
          </button>
        </div>
      </AdminPageHero>

      <div className="card">
        <h3>Новое задание (день {selectedDay})</h3>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Название</span>
            <input className="adm-input" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">Категория</span>
            <input className="adm-input" value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value })} />
          </label>
        </div>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Баллы</span>
            <input type="number" className="adm-input" value={newTask.points} onChange={e => setNewTask({ ...newTask, points: Number(e.target.value) })} />
          </label>
          <label className="adm-field">
            <span className="adm-label">Формат ответа</span>
            <select className="adm-input" value={newTask.answerType} onChange={e => setNewTask({ ...newTask, answerType: e.target.value })}>
              <EnumOptions values={['text', 'photo', 'text_and_photo']} />
            </select>
          </label>
        </div>
        <label className="adm-field">
          <span className="adm-label">Тип подтверждения</span>
          <select className="adm-input" value={newTask.confirmationType} onChange={e => setNewTask({ ...newTask, confirmationType: e.target.value })}>
            <EnumOptions values={['text_photo', 'photo', 'post_url', 'qr', 'auto', 'team']} />
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-label">Описание</span>
          <input className="adm-input" value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} />
        </label>
        <div className="adm-forum-grid-2">
          <label className="adm-field">
            <span className="adm-label">Частота выполнения</span>
            <select className="adm-input" value={newTask.executionType} onChange={e => setNewTask({ ...newTask, executionType: e.target.value })}>
              <EnumOptions values={['once', 'daily', 'repeatable']} />
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-label">Лимит / день</span>
            <input type="number" className="adm-input" value={newTask.dailyRepeatLimit} onChange={e => setNewTask({ ...newTask, dailyRepeatLimit: Number(e.target.value) })} />
          </label>
        </div>
        <label className="adm-field">
          <span className="adm-label">Ч на команду</span>
          <input type="number" className="adm-input" value={newTask.teamConfirmHours} onChange={e => setNewTask({ ...newTask, teamConfirmHours: Number(e.target.value) })} />
        </label>
        <div className="form-row" style={{ fontSize: 12, flexWrap: 'wrap', gap: 12 }}>
          <label className="adm-forum-check">
            <input type="checkbox" checked={newTask.allowRetry} onChange={e => setNewTask({ ...newTask, allowRetry: e.target.checked })} />
            Повтор
          </label>
          <label className="adm-forum-check">
            <input type="checkbox" checked={newTask.autoConfirm} onChange={e => setNewTask({ ...newTask, autoConfirm: e.target.checked })} />
            Автоподтверждение
          </label>
        </div>
        <button type="button" className="adm-btn adm-btn-primary" onClick={createTask}>
          Создать
        </button>
      </div>

      <p className="adm-muted">На дне {selectedDay}: {filtered.length} заданий</p>

      {filtered.map(t => {
        const draft = drafts[t.id] ?? draftFromTask(t);
        return (
          <TaskCard
            key={t.id}
            task={t}
            draft={draft}
            act={act}
            onDraftChange={patch => setDrafts(d => ({ ...d, [t.id]: { ...draft, ...patch } }))}
            onSave={() => saveTask(t)}
            onDelete={() => deleteTask(t.id)}
            onQr={() => qrTask(t.id)}
          />
        );
      })}
    </div>
  );
}

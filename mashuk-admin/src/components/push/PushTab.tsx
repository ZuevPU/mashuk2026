import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HomeNoticePanel } from './HomeNoticePanel';
import { PushAutoSchedulePanel } from './PushAutoSchedulePanel';
import { PushLogPanel } from './PushLogPanel';
import { PushListTable } from './PushListTable';
import { PushNotificationForm } from './PushNotificationForm';
import { PushTemplatesPanel } from './PushTemplatesPanel';
import {
  draftToPayload,
  emptyPushDraft,
  rowToDraft,
  type PushDraft,
  type PushNotificationRow,
  type PushTemplateRow,
  PUSH_NOTIFICATION_TYPE_OPTIONS,
  PUSH_AUDIENCE_OPTIONS,
} from './types';

type ListTab = 'sent' | 'queued' | 'drafts' | 'auto' | 'templates' | 'journal' | 'home';
type View = 'list' | 'form';

export type PushTabProps = AdminTabProps;

export function PushTab({ adminFetch, act, reloadKey }: PushTabProps) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [listTab, setListTab] = useState<ListTab>('sent');
  const [notifications, setNotifications] = useState<PushNotificationRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, queued: 0 });
  const [templates, setTemplates] = useState<PushTemplateRow[]>([]);
  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [totalDays, setTotalDays] = useState(8);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<PushDraft>(emptyPushDraft);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [sentFrom, setSentFrom] = useState('');
  const [sentTo, setSentTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (audienceFilter) params.set('audience', audienceFilter);
      if (sentFrom) params.set('sentFrom', sentFrom);
      if (sentTo) params.set('sentTo', sentTo);
      const q = params.toString();
      const res = await adminFetch(`/push/notifications${q ? `?${q}` : ''}`) as {
        notifications: PushNotificationRow[];
        summary: { total: number; queued: number };
      };
      setNotifications(res.notifications || []);
      setSummary(res.summary || { total: 0, queued: 0 });
      setTemplates((await adminFetch('/push/templates?kind=preset')).templates || []);
      setDirections((await adminFetch('/directions')).directions || []);
      setGroups((await adminFetch('/participants/groups')).groups || []);
      const fs = (await adminFetch('/forum-settings')).settings;
      setTotalDays(fs?.totalDays ?? 8);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, typeFilter, audienceFilter, sentFrom, sentTo]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const tabRows = useMemo(() => {
    if (listTab === 'sent') return notifications.filter(n => n.status === 'sent');
    if (listTab === 'queued') return notifications.filter(n => n.status === 'queued');
    if (listTab === 'drafts') return notifications.filter(n => n.status === 'draft');
    return [];
  }, [notifications, listTab]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyPushDraft());
    setPreviewText(null);
    setView('form');
  };

  const openEdit = async (id: number) => {
    const res = await adminFetch(`/push/notifications/${id}`) as { notification: PushNotificationRow };
    setEditingId(id);
    setDraft(rowToDraft(res.notification));
    setView('form');
  };

  const persist = async (status?: string): Promise<number> => {
    const payload = draftToPayload({ ...draft, status: status ?? draft.status });
    if (editingId) {
      await adminFetch(`/push/notifications/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return editingId;
    }
    const created = await adminFetch('/push/notifications', {
      method: 'POST',
      body: JSON.stringify({ ...payload, status: status ?? 'draft' }),
    }) as { notification: PushNotificationRow };
    setEditingId(created.notification.id);
    return created.notification.id;
  };

  const applyTemplate = async (templateId: number) => {
    const res = await adminFetch(`/push/templates/${templateId}/apply`) as {
      draft: Partial<PushDraft>;
    };
    setDraft(d => ({ ...d, ...res.draft, templateId }));
  };

  const uploadImage = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const up = await adminFetch('/upload-image', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }) as { url: string };
    setDraft(d => ({ ...d, imageUrl: up.url }));
  };

  const runPreview = async () => {
    if (!editingId) {
      setPreviewText(draft.body);
      return;
    }
    const res = await adminFetch(`/push/notifications/${editingId}/preview`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as { preview: { body: string } };
    setPreviewText(res.preview.body);
  };

  // Не размонтировать «Главный экран»: после act()/reloadKey иначе сбрасывается черновик плашки.
  if (loading && view === 'list' && listTab !== 'home') {
    return <p className="adm-muted">Загрузка пушей…</p>;
  }

  if (view === 'form') {
    return (
      <div className="adm-forum">
        <PushNotificationForm
          draft={draft}
          templates={templates}
          directions={directions}
          groups={groups}
          totalDays={totalDays}
          showPreview={showPreview}
          previewText={previewText}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          onApplyTemplate={applyTemplate}
          onSaveDraft={() => act(async () => {
            await persist('draft');
          }, 'Черновик сохранён')}
          onTest={() => act(async () => {
            const id = await persist('draft');
            const res = await adminFetch(`/push/notifications/${id}/test`, { method: 'POST', body: '{}' }) as {
              deliveryStatusHint?: string;
              deliveryStatus?: string;
            };
            return res.deliveryStatusHint || res.deliveryStatus || 'Тест отправлен';
          }, 'Тест отправлен')}
          onTogglePreview={() => {
            setShowPreview(v => !v);
            if (!showPreview) runPreview().catch(() => setPreviewText(draft.body));
          }}
          onSend={mode => act(async () => {
            const nextStatus = mode === 'queue' || draft.sendMode !== 'now' ? 'queued' : 'draft';
            const id = await persist(nextStatus);
            await adminFetch(`/push/notifications/${id}/send`, {
              method: 'POST',
              body: JSON.stringify({ mode }),
            });
            setView('list');
            await load();
          }, mode === 'queue' ? 'В очереди' : 'Отправлено')}
          onCancel={() => { setView('list'); setEditingId(null); }}
          onImagePick={file => act(() => uploadImage(file), 'Картинка загружена', { reload: false })}
        />
      </div>
    );
  }

  const tabs: { key: ListTab; label: string }[] = [
    { key: 'sent', label: 'Отправлено' },
    { key: 'queued', label: 'В очереди' },
    { key: 'drafts', label: 'Черновики' },
    { key: 'home', label: 'Главный экран' },
    { key: 'auto', label: 'Автоматические' },
    { key: 'templates', label: 'Шаблоны' },
    { key: 'journal', label: 'Журнал' },
  ];

  return (
    <div className="adm-forum">
      <AdminPageHero
        title={listTab === 'home'
          ? 'Уведомления · Главный экран'
          : `Уведомления · ${summary.total} рассылок · ${summary.queued} в очереди`}
        hint={listTab === 'home'
          ? 'Редакционная плашка на главной участника: заголовок, текст, кнопка-ссылка и картинки. Не связана с VK-пушами.'
          : 'Ручные рассылки — вкладка «Рассылки». Автоматические сообщения по расписанию и по событиям — «Автоматические». Участник видит push во VK и баннер в приложении.'}
      >
        <div className="adm-seg" style={{ marginBottom: 12 }}>
          {tabs.map(t => (
            <button key={t.key} type="button" className={listTab === t.key ? 'on' : ''} onClick={() => setListTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {(listTab === 'sent' || listTab === 'queued' || listTab === 'drafts') && (
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            <select className="adm-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Тип</option>
              {PUSH_NOTIFICATION_TYPE_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <select className="adm-input" value={audienceFilter} onChange={e => setAudienceFilter(e.target.value)}>
              <option value="">Аудитория</option>
              {PUSH_AUDIENCE_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <input type="date" className="adm-input" value={sentFrom} onChange={e => setSentFrom(e.target.value)} title="Дата отправки от" />
            <input type="date" className="adm-input" value={sentTo} onChange={e => setSentTo(e.target.value)} title="Дата отправки до" />
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => load()}>Применить</button>
            <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={openCreate}>
              + Создать уведомление
            </button>
          </div>
        )}
      </AdminPageHero>

      {listTab === 'home' ? (
        <HomeNoticePanel adminFetch={adminFetch} act={act} reloadKey={reloadKey} />
      ) : listTab === 'templates' ? (
        <PushTemplatesPanel adminFetch={adminFetch} act={act} templates={templates} onReload={() => load()} />
      ) : listTab === 'auto' ? (
        <PushAutoSchedulePanel adminFetch={adminFetch} act={act} />
      ) : listTab === 'journal' ? (
        <PushLogPanel adminFetch={adminFetch} />
      ) : (
        <div className="card">
          <PushListTable
            rows={tabRows}
            onEdit={id => act(() => openEdit(id))}
            onDuplicate={id => act(async () => {
              await adminFetch(`/push/notifications/${id}/duplicate`, { method: 'POST', body: '{}' });
              await load();
            }, 'Копия создана')}
            onDelete={id => {
              if (confirmDelete('Удалить уведомление?')) {
                act(async () => {
                  await adminFetch(`/push/notifications/${id}`, { method: 'DELETE' });
                  await load();
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

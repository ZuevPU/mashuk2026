import React, { useEffect, useState } from 'react';

import { adminDownloadBinary, getAdminEditingShiftId } from '../admin/client';
import { CONFIRM_BLOCK_PARTICIPANT, CONFIRM_DELETE_PARTICIPANT, CONFIRM_REMOVE_FROM_PROGRAM, confirmDelete } from '../admin/confirmDelete';
import { label } from '../labels/ru';
import { formatAnswerPreview } from '../utils/formatAnswerPreview';

import { VkProfileLink } from './VkProfileLink';
import { ParticipantAvatar } from './participants/ParticipantAvatar';
import { RowActionsMenu } from './participants/RowActionsMenu';
import { ParticipantFinalProfileModal } from './participants/ParticipantFinalProfileModal';
import { ParticipantAnalyticalProfileModal } from './participants/ParticipantAnalyticalProfileModal';
import { ParticipantDataDrivenProfileModal } from './participants/ParticipantDataDrivenProfileModal';



type CardData = {

  participant?: {

    id: number;

    firstName?: string;

    lastName?: string;

    vkId?: string;

    direction?: string;

    groupId?: number | null;

    groupName?: string;

    pedagogicalRole?: string;

    strongRole?: string;

    growthRole?: string;

    pathPoints?: number;

    experiencePoints?: number;

    selfDeletedAt?: string | null;

    consentPd?: boolean;

    consentAnalytics?: boolean;

    interests?: unknown;

    workplace?: string | null;

    region?: string | null;

    position?: string | null;

    goals?: unknown;

    createdAt?: string;

    age?: number | null;

    isBlocked?: boolean | null;

    blockReason?: string | null;

    avatarUrl?: string | null;

    outcomesEdited?: unknown;

    nextStepsEdited?: unknown;

  };

  answers?: any[];

  submissions?: any[];

  points?: any[];

  medals?: any[];

  medalProgress?: { id: number; name: string; level?: string; earned: boolean; awardedAt?: string | null }[];

  pointsSummary?: { path: number; experience: number; bonus: number; total: number; byDay: Record<string, number> };

  pointsAudit?: {
    ok: boolean;
    stored: { path: number; experience: number; bonus: number; total: number };
    fromLog: { path: number; experience: number; bonus: number; total: number };
    byAction: Array<{ actionType: string; track: string; points: number; count: number }>;
    issues: Array<{ code: string; severity: 'ok' | 'warn' | 'error'; message: string }>;
    answersWithoutLog: number;
    logRows: number;
    revokedRows: number;
  };

  piggybank?: any[];

  dayStates?: any[];

  avatarUrl?: string | null;

};

type PointsTrackFilter = 'all' | 'path' | 'experience' | 'bonus';

type PointsSortKey = 'track' | 'type' | 'source' | 'points' | 'when';

function pointsTrackLabel(track: string | null | undefined): string {
  if (track === 'path') return 'Путь';
  if (track === 'experience') return 'Опыт';
  if (track === 'bonus') return 'Бонус';
  return '—';
}

function pointsSourceKindLabel(kind: string | null | undefined): string {
  if (kind === 'question') return 'Вопрос';
  if (kind === 'task') return 'Задание';
  if (kind === 'exchange_question') return 'Обмен: вопрос';
  if (kind === 'exchange_answer') return 'Обмен: ответ';
  if (kind === 'piggybank') return 'Копилка';
  if (kind === 'attendance') return 'Посещение';
  return 'Источник';
}

function pointsContentLabel(kind: string | null | undefined): string {
  if (kind === 'piggybank') return 'Текст';
  if (kind === 'exchange_question') return 'Текст вопроса';
  if (kind === 'exchange_answer' || kind === 'question' || kind === 'task') return 'Ответ';
  return 'Текст';
}

function pointsSortValue(pt: any, key: PointsSortKey): string | number {
  if (key === 'track') return pointsTrackLabel(pt.track);
  if (key === 'type') return label(pt.actionType || '');
  if (key === 'source') {
    return [pt.sourceTitle, pt.sourceDescription, pt.answerPreview].filter(Boolean).join(' ');
  }
  if (key === 'points') return Number(pt.points) || 0;
  return pt.createdAt ? new Date(pt.createdAt).getTime() : 0;
}



function outcomesToText(raw: unknown): string {

  if (Array.isArray(raw)) return raw.map(String).join('\n');

  if (raw && typeof raw === 'object') {

    const o = raw as { bullets?: string[]; summary?: string };

    if (Array.isArray(o.bullets)) return o.bullets.join('\n');

    if (typeof o.summary === 'string') return o.summary;

  }

  if (typeof raw === 'string') return raw;

  return '';

}



function nextStepsToText(raw: unknown): string {

  if (Array.isArray(raw)) return raw.map(String).join('\n');

  if (typeof raw === 'string') return raw;

  return '';

}



export function ParticipantCardModal({

  card,

  tab,

  setTab,

  onClose,

  onReloadCard,

  adminFetch,

  act,

  roleOptions,
  adminRole,

}: {

  card: CardData;

  tab: string;

  setTab: (t: string) => void;

  onClose: () => void;

  onReloadCard: () => void;

  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;

  act: (fn: () => Promise<unknown>, msg?: string) => void;

  roleOptions: { key: string; name: string }[];
  adminRole?: string;

}) {
  const canSettings = adminRole === 'admin' || adminRole === 'superadmin';

  const p = card.participant!;
  const [taskCatalog, setTaskCatalog] = useState<{ id: number; title?: string }[]>([]);
  const [manualTaskId, setManualTaskId] = useState('');
  const [registrationGroups, setRegistrationGroups] = useState<{ id: number; name: string }[]>([]);
  const [shiftOptions, setShiftOptions] = useState<Array<{ id: number; name: string; code: string; status: string }>>([]);
  const [currentShiftId, setCurrentShiftId] = useState<number | null>(null);
  const [copyTargetId, setCopyTargetId] = useState<number | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    firstName: '',
    lastName: '',
    age: '',
    workplace: '',
    position: '',
    region: '',
  });

  const pickCopyTarget = () => {
    const others = shiftOptions.filter(s => s.id !== currentShiftId);
    return others.find(s => s.status === 'active')
      ?? others.find(s => s.status !== 'draft' && s.status !== 'archived')
      ?? others[0];
  };

  useEffect(() => {
    adminFetch('/shifts')
      .then((res: { shifts?: Array<{ id: number; name: string; code: string; status: string }>; activeShiftId?: number }) => {
        const list = res.shifts ?? [];
        setShiftOptions(list);
        setCurrentShiftId(getAdminEditingShiftId() ?? res.activeShiftId ?? null);
      })
      .catch(() => setShiftOptions([]));
  }, [adminFetch]);

  useEffect(() => {
    if (tab !== 'tasks' || !p?.id) return;
    adminFetch('/tasks')
      .then((res: { tasks?: { id: number; title?: string }[] }) => {
        setTaskCatalog(res.tasks ?? []);
      })
      .catch(() => setTaskCatalog([]));
  }, [tab, p?.id, adminFetch]);

  useEffect(() => {
    setProfileDraft({
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      age: p.age != null ? String(p.age) : '',
      workplace: p.workplace || '',
      position: p.position || '',
      region: p.region || '',
    });
  }, [p.id, p.firstName, p.lastName, p.age, p.workplace, p.position, p.region]);

  useEffect(() => {
    if (tab !== 'profile') return;
    adminFetch('/groups')
      .then((res: { groups?: { id: number; name: string }[] }) => {
        setRegistrationGroups(res.groups ?? []);
      })
      .catch(() => setRegistrationGroups([]));
  }, [tab, adminFetch]);

  const avatarDisplayUrl = card.participant?.avatarUrl || card.avatarUrl || null;
  const leadingRole = p.strongRole || p.pedagogicalRole;
  const leadingRoleLabel = leadingRole ? label(leadingRole) : 'роль не задана';

  const tabs = ['profile', 'activity', 'answers', 'tasks', 'points', 'medals', 'piggybank', 'logs'] as const;

  const tabLabels: Record<string, string> = {

    profile: 'Профиль',

    activity: 'Активность',

    answers: 'Ответы',

    tasks: 'Задания',

    points: 'Баллы',

    medals: 'Медали',

    piggybank: 'Копилка',

    logs: 'Логи',

  };



  const [outcomesText, setOutcomesText] = useState('');

  const [nextStepsText, setNextStepsText] = useState('');

  const [pdfOutcomes, setPdfOutcomes] = useState('');

  const [pdfNextSteps, setPdfNextSteps] = useState('');

  const [activityItems, setActivityItems] = useState<any[]>([]);

  const [adminLogs, setAdminLogs] = useState<any[]>([]);

  const [answerDayFilter, setAnswerDayFilter] = useState('');

  const [answerBlockFilter, setAnswerBlockFilter] = useState('');

  const [answerReflectionFilter, setAnswerReflectionFilter] = useState('');

  const [piggyTagFilter, setPiggyTagFilter] = useState('');

  const [piggySourceFilter, setPiggySourceFilter] = useState('');

  const [piggyDayFilter, setPiggyDayFilter] = useState('');

  const [finalProfileOpen, setFinalProfileOpen] = useState(false);
  const [analyticalProfileOpen, setAnalyticalProfileOpen] = useState(false);
  const [dataDrivenProfileOpen, setDataDrivenProfileOpen] = useState(false);

  const [pointsTrack, setPointsTrack] = useState<'path' | 'experience'>('path');
  const [pointsAmount, setPointsAmount] = useState(10);
  const [pointsReason, setPointsReason] = useState('');
  const [pointsFilter, setPointsFilter] = useState<PointsTrackFilter>('all');
  const [pointsSort, setPointsSort] = useState<{ key: PointsSortKey; asc: boolean }>({ key: 'when', asc: false });
  const [bulkForumDay, setBulkForumDay] = useState<number | ''>('');
  const [bulkReason, setBulkReason] = useState('');
  const [medalCatalog, setMedalCatalog] = useState<{ id: number; name: string; level?: string }[]>([]);
  const [awardMedalId, setAwardMedalId] = useState<number | ''>('');

  const pointsAudit = card.pointsAudit;
  const filteredPoints = (card.points || []).filter((pt: any) => {
    if (pointsFilter === 'all') return true;
    return (pt.track || 'experience') === pointsFilter;
  });
  const sortedPoints = [...filteredPoints].sort((a: any, b: any) => {
    const av = pointsSortValue(a, pointsSort.key);
    const bv = pointsSortValue(b, pointsSort.key);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), 'ru');
    if (cmp === 0) cmp = (Number(a.id) || 0) - (Number(b.id) || 0);
    return pointsSort.asc ? cmp : -cmp;
  });
  const filteredPointsSum = filteredPoints.reduce((sum: number, pt: any) => {
    if (pt.revokedAt || String(pt.actionType || '').endsWith('_revoke')) return sum;
    return sum + (Number(pt.points) || 0);
  }, 0);
  const togglePointsSort = (key: PointsSortKey) => {
    setPointsSort((prev) => (prev.key === key ? { key, asc: !prev.asc } : { key, asc: key === 'when' || key === 'points' ? false : true }));
  };
  const pointsSortMark = (key: PointsSortKey) => (
    pointsSort.key === key ? (pointsSort.asc ? ' ↑' : ' ↓') : ' ↕'
  );
  const ratingShown = pointsFilter === 'all'
    ? (card.pointsSummary?.total ?? ((p.pathPoints ?? 0) + (p.experiencePoints ?? 0)))
    : pointsFilter === 'path'
      ? (card.pointsSummary?.path ?? p.pathPoints ?? 0)
      : pointsFilter === 'experience'
        ? (card.pointsSummary?.experience ?? p.experiencePoints ?? 0)
        : (card.pointsSummary?.bonus ?? 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {

    setOutcomesText(outcomesToText(p.outcomesEdited));

    setNextStepsText(nextStepsToText(p.nextStepsEdited));

    adminFetch(`/participants/${p.id}/pdf-draft`)

      .then((r: { draft?: { blocks?: Record<string, unknown> }; preview?: { outcomes?: string[]; nextSteps?: string[] } }) => {

        const blocks = r.draft?.blocks ?? {};

        setPdfOutcomes(String(blocks.outcomes ?? (r.preview?.outcomes ?? []).join('\n')));

        setPdfNextSteps(String(blocks.nextSteps ?? (r.preview?.nextSteps ?? []).join('\n')));

      })

      .catch(() => { /* optional */ });

  }, [p.id, p.outcomesEdited, p.nextStepsEdited, adminFetch]);



  useEffect(() => {

    if (tab === 'activity') {

      adminFetch(`/participants/${p.id}/activity`).then((r: { items?: any[] }) => setActivityItems(r.items || [])).catch(() => setActivityItems([]));

    }

    if (tab === 'logs') {

      adminFetch(`/participants/${p.id}/admin-actions`).then((r: { actions?: any[] }) => setAdminLogs(r.actions || [])).catch(() => setAdminLogs([]));

    }

    if (tab === 'medals') {
      adminFetch('/medals?status=active&awardType=manual')
        .then((r: { medals?: { id: number; name: string; level?: string }[] }) => setMedalCatalog(r.medals || []))
        .catch(() => setMedalCatalog([]));
    }

  }, [tab, p.id, adminFetch]);



  const previewPdf = async () => {
    const apiBase = import.meta.env.PROD
      ? (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost')
        ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
        : 'https://zuevpu-mashuk2026-ae82.twc1.net/api')
      : String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const base = apiBase ? `${apiBase}/admin` : '/api/admin';
    const { adminAuthHeaders } = await import('../admin/client');
    const res = await fetch(`${base}/participants/${p.id}/pdf-preview`, {
      headers: adminAuthHeaders(),
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };



  const displayName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Участник';

  return (
    <>
    <div className="adm-modal-backdrop adm-participant-card-backdrop" onClick={onClose} role="presentation">

      <div
        className="adm-modal adm-participant-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-pc-dialog-title"
      >

        <header className="adm-pc-topbar">
          <button
            type="button"
            className="adm-pc-close-btn"
            onClick={onClose}
            aria-label="Закрыть карточку участника"
          >
            <span className="adm-pc-close-icon" aria-hidden>←</span>
            Закрыть
          </button>
          <h2 className="adm-pc-topbar-title" id="adm-pc-dialog-title">{displayName}</h2>
          <span className="adm-pc-topbar-id">ID {p.id}</span>
          <RowActionsMenu actions={canSettings ? [
            {
              label: 'Копировать в смену',
              onClick: () => {
                const target = pickCopyTarget();
                if (!target) {
                  alert('Нет другой смены');
                  return;
                }
                setCopyTargetId(target.id);
              },
            },
            { label: 'Отправить пуш', onClick: () => {
              const text = prompt('Текст пуша');
              if (!text?.trim()) return;
              act(async () => {
                const res = await adminFetch(`/participants/${p.id}/push`, {
                  method: 'POST',
                  body: JSON.stringify({ text: text.trim() }),
                }) as { deliveryStatusHint?: string; deliveryStatus?: string };
                return res.deliveryStatusHint || res.deliveryStatus || 'Пуш отправлен';
              }, 'Пуш отправлен');
            } },
          ] : []} />
        </header>

        <div className="adm-pc-header">
          <div className="adm-pc-hero-strip">
            <ParticipantAvatar
                firstName={p.firstName}
                lastName={p.lastName}
                avatarUrl={avatarDisplayUrl}
                size="md"
              />
            <div className="adm-pc-hero-main">
              <div className="adm-pc-meta adm-pc-meta-light">
                <VkProfileLink vkId={p.vkId} /> · {p.direction || '—'}
                {p.groupName ? ` · ${p.groupName}` : ''} · {leadingRoleLabel}
              </div>
              <div className="adm-pc-chips adm-pc-chips-inline">
                <span className="adm-chip adm-chip-light">Путь {p.pathPoints ?? 0}</span>
                <span className="adm-chip adm-chip-light adm-chip-accent">Опыт {p.experiencePoints ?? 0}</span>
              </div>
            </div>
          </div>

          {(p.isBlocked || p.selfDeletedAt) && (
            <div className="adm-pc-status-banner" style={{
              margin: '0 16px 12px',
              padding: '10px 12px',
              borderRadius: 8,
              background: p.isBlocked ? '#FFF5F5' : '#FFFAF0',
              border: `1px solid ${p.isBlocked ? '#FEB2B2' : '#FEEBC8'}`,
              fontSize: 13,
            }}>
              {p.isBlocked && (
                <div><strong>Заблокирован.</strong> {p.blockReason ? `Причина: ${p.blockReason}` : 'Участник видит экран «Доступ ограничен».'}</div>
              )}
              {p.selfDeletedAt && (
                <div style={{ marginTop: p.isBlocked ? 6 : 0 }}><strong>Не в программе</strong> (исключён или вышел сам). Восстановите доступ кнопкой «Вернуть в программу».</div>
              )}
            </div>
          )}

          <div className="adm-pc-toolbar adm-forum-toolbar">
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setTab('profile')}>Редактировать профиль</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setTab('profile')}>Скорректировать роль</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setTab('points')}>Начислить/снять баллы</button>
            {canSettings && <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => {
              const text = prompt('Текст пуша');
              if (!text?.trim()) return;
              act(async () => {
                const res = await adminFetch(`/participants/${p.id}/push`, {
                  method: 'POST',
                  body: JSON.stringify({ text: text.trim() }),
                }) as { deliveryStatusHint?: string; deliveryStatus?: string };
                return res.deliveryStatusHint || res.deliveryStatus || 'Пуш отправлен';
              }, 'Пуш отправлен');
            }}>Отправить пуш</button>}
            {canSettings && <button
              type="button"
              className="adm-btn adm-btn-sm adm-btn-secondary"
              onClick={() => {
                const target = pickCopyTarget();
                if (!target) {
                  alert('Нет другой смены');
                  return;
                }
                setCopyTargetId(target.id);
              }}
            >
              Копировать в смену
            </button>}
            <button
              type="button"
              className="adm-btn adm-btn-sm adm-btn-secondary"
              onClick={() => setFinalProfileOpen(true)}
            >
              Итоговый профиль
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-sm adm-btn-secondary"
              onClick={() => setAnalyticalProfileOpen(true)}
            >
              Профиль участника 2
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-sm adm-btn-secondary"
              onClick={() => setDataDrivenProfileOpen(true)}
            >
              Профиль участника 3
            </button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => act(() => adminDownloadBinary(`/exports/participant/${p.id}/answers?format=xlsx`, `participant_${p.id}.xlsx`), 'Excel')}>Выгрузить всё</button>
            {p.isBlocked
              ? (
                <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => act(async () => {
                  await adminFetch(`/participants/${p.id}/unblock`, { method: 'POST' });
                  onReloadCard();
                }, 'Разблокирован')}>Разблокировать</button>
              )
              : (
                <button type="button" className="adm-btn adm-btn-sm btn-danger" onClick={() => {
                  if (!confirmDelete(CONFIRM_BLOCK_PARTICIPANT)) return;
                  act(async () => {
                    await adminFetch(`/participants/${p.id}/block`, { method: 'POST', body: '{}' });
                    onReloadCard();
                  }, 'Заблокирован');
                }}>Заблокировать</button>
              )}
            {p.selfDeletedAt
              ? (
                <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => act(async () => {
                  await adminFetch(`/participants/${p.id}/restore`, { method: 'POST' });
                  onReloadCard();
                }, 'Восстановлен')}>Вернуть в программу</button>
              )
              : (
                <button type="button" className="adm-btn adm-btn-sm btn-danger" onClick={() => {
                  if (!confirmDelete(CONFIRM_REMOVE_FROM_PROGRAM)) return;
                  act(async () => {
                    await adminFetch(`/participants/${p.id}/remove-from-program`, { method: 'POST', body: '{}' });
                    onReloadCard();
                  }, 'Исключён из программы');
                }}>Исключить из программы</button>
              )}
            <button type="button" className="adm-btn adm-btn-sm btn-danger" onClick={() => {
              if (!confirmDelete(CONFIRM_DELETE_PARTICIPANT)) return;
              act(async () => {
                await adminFetch(`/participants/${p.id}/registration`, { method: 'DELETE' });
                onClose();
              }, 'Удалён');
            }}>Удалить безвозвратно</button>
          </div>
        </div>

        <div className="adm-seg adm-pc-seg">

          {tabs.map(t => (

            <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>

              {tabLabels[t]}

            </button>

          ))}

        </div>

        <div className="adm-pc-body">

          {tab === 'profile' && (

            <div className="adm-stack">

              <div className="adm-field-row"><span className="adm-label">ВКонтакте</span><span><VkProfileLink vkId={p.vkId} /></span></div>

              <div className="adm-forum-block" style={{ margin: '8px 0 12px' }}>
                <div className="adm-label" style={{ marginBottom: 8 }}>Анкетные данные</div>
                <div className="adm-forum-grid-2">
                  <label className="adm-field">
                    <span className="adm-label">Имя</span>
                    <input
                      className="adm-input"
                      value={profileDraft.firstName}
                      onChange={e => setProfileDraft(d => ({ ...d, firstName: e.target.value }))}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-label">Фамилия</span>
                    <input
                      className="adm-input"
                      value={profileDraft.lastName}
                      onChange={e => setProfileDraft(d => ({ ...d, lastName: e.target.value }))}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-label">Возраст</span>
                    <input
                      className="adm-input"
                      type="number"
                      min={14}
                      max={100}
                      value={profileDraft.age}
                      onChange={e => setProfileDraft(d => ({ ...d, age: e.target.value }))}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-label">Регион</span>
                    <input
                      className="adm-input"
                      value={profileDraft.region}
                      onChange={e => setProfileDraft(d => ({ ...d, region: e.target.value }))}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-label">Место работы</span>
                    <input
                      className="adm-input"
                      value={profileDraft.workplace}
                      onChange={e => setProfileDraft(d => ({ ...d, workplace: e.target.value }))}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-label">Должность</span>
                    <input
                      className="adm-input"
                      value={profileDraft.position}
                      onChange={e => setProfileDraft(d => ({ ...d, position: e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary adm-btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => act(async () => {
                    await adminFetch(`/participants/${p.id}/profile`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        firstName: profileDraft.firstName,
                        lastName: profileDraft.lastName,
                        age: profileDraft.age.trim() ? Number(profileDraft.age) : null,
                        workplace: profileDraft.workplace,
                        position: profileDraft.position,
                        region: profileDraft.region,
                      }),
                    });
                    onReloadCard();
                  }, 'Профиль сохранён')}
                >
                  Сохранить профиль
                </button>
              </div>

              <label className="adm-field">

                <span className="adm-label">Педагогическая роль</span>

                <select

                  className="adm-input"

                  value={p.pedagogicalRole || ''}

                  onChange={async e => {

                    await adminFetch(`/participants/${p.id}/role`, {

                      method: 'PATCH',

                      body: JSON.stringify({ pedagogicalRole: e.target.value || null }),

                    });

                    onReloadCard();

                  }}

                >

                  <option value="">—</option>

                  {roleOptions.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}

                </select>

              </label>

              <label className="adm-field">
                <span className="adm-label">Группа при регистрации</span>
                <select
                  className="adm-input"
                  value={p.groupId ?? ''}
                  onChange={async e => {
                    const v = e.target.value;
                    await adminFetch(`/participants/${p.id}/group`, {
                      method: 'PATCH',
                      body: JSON.stringify({ groupId: v ? Number(v) : null }),
                    });
                    onReloadCard();
                  }}
                >
                  <option value="">— без группы</option>
                  {registrationGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>

              <div className="adm-field-row">Сильная / рост: {p.strongRole || '—'} / {p.growthRole || '—'}</div>

              <div className="adm-field-row">
                Согласия: ПД {p.consentPd ? 'да' : 'нет'} · аналитика {p.consentAnalytics ? 'да' : 'нет'}
              </div>

              {p.interests != null && (
                <div className="adm-field-row">
                  Интересы: {Array.isArray(p.interests) ? (p.interests as string[]).join(', ') : JSON.stringify(p.interests)}
                </div>
              )}

              {p.createdAt && (
                <div className="adm-field-row">Регистрация: {new Date(p.createdAt).toLocaleString('ru-RU')}</div>
              )}

              {p.goals != null && p.goals !== '' && (
                <div className="adm-field-row">
                  Цели: {typeof p.goals === 'string' ? p.goals : JSON.stringify(p.goals)}
                </div>
              )}

              <label className="adm-field">

                <span className="adm-label">Что получилось (редактура)</span>

                <textarea

                  className="adm-input"

                  rows={4}

                  value={outcomesText}

                  onChange={e => setOutcomesText(e.target.value)}

                />

                <button

                  type="button"

                  className="adm-btn adm-btn-secondary adm-btn-sm"

                  style={{ marginTop: 6 }}

                  onClick={() => act(async () => {

                    const bullets = outcomesText.split('\n').map(s => s.trim()).filter(Boolean);

                    await adminFetch(`/participants/${p.id}/role`, {

                      method: 'PATCH',

                      body: JSON.stringify({ outcomesEdited: { bullets } }),

                    });

                    onReloadCard();

                  }, 'Итоги сохранены')}

                >

                  Сохранить итоги

                </button>

              </label>

              <label className="adm-field">

                <span className="adm-label">Следующие шаги (редактура)</span>

                <textarea

                  className="adm-input"

                  rows={3}

                  value={nextStepsText}

                  onChange={e => setNextStepsText(e.target.value)}

                />

                <button

                  type="button"

                  className="adm-btn adm-btn-secondary adm-btn-sm"

                  style={{ marginTop: 6 }}

                  onClick={() => act(async () => {

                    const steps = nextStepsText.split('\n').map(s => s.trim()).filter(Boolean);

                    await adminFetch(`/participants/${p.id}/role`, {

                      method: 'PATCH',

                      body: JSON.stringify({ nextStepsEdited: steps }),

                    });

                    onReloadCard();

                  }, 'Шаги сохранены')}

                >

                  Сохранить шаги

                </button>

              </label>

              <div className="adm-field">

                <span className="adm-label">PDF — блоки черновика</span>

                <textarea

                  className="adm-input"

                  rows={3}

                  placeholder="Что получилось в PDF"

                  value={pdfOutcomes}

                  onChange={e => setPdfOutcomes(e.target.value)}

                />

                <textarea

                  className="adm-input"

                  rows={2}

                  placeholder="Следующие шаги в PDF"

                  value={pdfNextSteps}

                  onChange={e => setPdfNextSteps(e.target.value)}

                  style={{ marginTop: 6 }}

                />

                <div className="form-row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>

                  <button

                    type="button"

                    className="adm-btn adm-btn-secondary adm-btn-sm"

                    onClick={() => act(async () => {

                      await adminFetch(`/participants/${p.id}/pdf-draft`, {

                        method: 'PATCH',

                        body: JSON.stringify({

                          blocks: { outcomes: pdfOutcomes, nextSteps: pdfNextSteps },

                        }),

                      });

                    }, 'Черновик PDF сохранён')}

                  >

                    Сохранить черновик

                  </button>

                  <button

                    type="button"

                    className="adm-btn adm-btn-secondary adm-btn-sm"

                    onClick={() => act(async () => { await previewPdf(); }, 'Превью открыто')}

                  >

                    Превью PDF

                  </button>

                  <button

                    type="button"

                    className="adm-btn adm-btn-sm"

                    onClick={() => act(async () => {

                      await adminFetch(`/participants/${p.id}/pdf-publish`, {

                        method: 'POST',

                        body: JSON.stringify({ autoWhitelist: true }),

                      });

                    }, 'PDF выдан участнику')}

                  >

                    Выдать участнику

                  </button>

                </div>

              </div>

              {p.selfDeletedAt && (

                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => act(async () => {

                  await adminFetch(`/participants/${p.id}/restore`, { method: 'POST' });

                  onReloadCard();

                }, 'Восстановлен')}>Восстановить аккаунт</button>

              )}

            </div>

          )}

          {tab === 'answers' && (

            <>

            <div className="adm-forum-toolbar" style={{ marginBottom: 8 }}>

              <select className="adm-input" value={answerDayFilter} onChange={e => setAnswerDayFilter(e.target.value)}>

                <option value="">Все дни</option>

                {[...new Set((card.answers || []).map((a: any) => a.dayNumber).filter(Boolean))].sort().map((d: any) => (

                  <option key={d} value={String(d)}>День {d}</option>

                ))}

              </select>

              <select className="adm-input" value={answerBlockFilter} onChange={e => setAnswerBlockFilter(e.target.value)}>

                <option value="">Все блоки</option>

                {[...new Set((card.answers || []).map((a: any) => a.block).filter(Boolean))].sort().map((b: any) => (

                  <option key={b} value={String(b)}>{label(b) || b}</option>

                ))}

              </select>

              <select className="adm-input" value={answerReflectionFilter} onChange={e => setAnswerReflectionFilter(e.target.value)}>

                <option value="">Тип рефлексии</option>

                {[...new Set((card.answers || []).map((a: any) => a.reflectionKind).filter(Boolean))].sort().map((k: any) => (

                  <option key={k} value={String(k)}>{label(k) || k}</option>

                ))}

              </select>

            </div>

            <table className="adm-table">

              <thead><tr><th>Вопрос</th><th>Блок</th><th>День</th><th>Ответ</th></tr></thead>

              <tbody>

                {(card.answers || []).filter((a: any) => {

                  if (answerDayFilter && String(a.dayNumber) !== answerDayFilter) return false;

                  if (answerBlockFilter && String(a.block || '') !== answerBlockFilter) return false;

                  if (answerReflectionFilter && String(a.reflectionKind || '') !== answerReflectionFilter) return false;

                  return true;

                }).slice(0, 100).map((a: any) => (

                  <tr key={a.id}>

                    <td>{a.questionTitle}</td>

                    <td>{a.block ? label(a.block) : '—'}</td>

                    <td>{a.dayNumber ?? '—'}</td>

                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatAnswerPreview(a.answerData)}>
                      {formatAnswerPreview(a.answerData)}
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            </>

          )}



          {tab === 'activity' && (

            <div className="adm-stack">

              {activityItems.length === 0 && <p className="adm-muted">Нет событий активности</p>}

              {activityItems.map((it, i) => (

                <div key={i} className="card" style={{ padding: 10, fontSize: 12 }}>

                  <div style={{ color: '#888' }}>{it.at ? new Date(it.at).toLocaleString('ru-RU') : '—'} · {it.kind}</div>

                  <strong>{it.title}</strong>

                  {it.sourceTitle && it.sourceTitle !== it.title && (
                    <div style={{ marginTop: 4, fontWeight: 600 }}>{it.sourceTitle}</div>
                  )}

                  {(it.sourceDescription || it.description) && (
                    <div style={{ marginTop: 4, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {it.sourceDescription || it.description}
                    </div>
                  )}

                  {it.detail && <div style={{ marginTop: 4, color: '#666' }}>{it.detail}</div>}

                </div>

              ))}

            </div>

          )}



          {tab === 'logs' && (

            <table className="adm-table">

              <thead><tr><th>Когда</th><th>Действие</th><th>Раздел</th><th>Комментарий</th></tr></thead>

              <tbody>

                {adminLogs.map((lg: any) => (

                  <tr key={lg.id}>

                    <td style={{ whiteSpace: 'nowrap' }}>{lg.createdAt ? new Date(lg.createdAt).toLocaleString('ru-RU') : '—'}</td>

                    <td>{lg.actionType}</td>

                    <td>{lg.section || '—'}</td>

                    <td>{lg.comment || '—'}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          )}



          {tab === 'tasks' && (

            <>
            <div className="adm-forum-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <select
                className="adm-input"
                value={manualTaskId}
                onChange={e => setManualTaskId(e.target.value)}
              >
                <option value="">— задание для ручной отметки —</option>
                {taskCatalog.map(t => (
                  <option key={t.id} value={String(t.id)}>{t.title || `Задание #${t.id}`}</option>
                ))}
              </select>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={!manualTaskId}
                onClick={() => act(
                  async () => {
                    const path = `/participants/${p.id}/tasks/${manualTaskId}/complete`;
                    const body = { comment: 'Отмечено в карточке участника' };
                    try {
                      await adminFetch(path, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      });
                    } catch (err) {
                      const msg = String(err);
                      if (!msg.includes('уже отмечено') || !confirm(`${msg}\n\nНачислить ещё раз?`)) {
                        throw err;
                      }
                      await adminFetch(path, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...body, force: true }),
                      });
                    }
                    onReloadCard();
                  },
                  'Задание отмечено',
                )}
              >
                Отметить выполненным
              </button>
              <span className="adm-muted" style={{ fontSize: 12 }}>
                Одно и то же задание можно отметить несколько раз — каждый раз начислятся баллы.
              </span>
            </div>
            <table className="adm-table">

              <thead><tr><th>Задание</th><th>Статус</th><th>Ответ</th><th>XP</th><th>Команда</th><th /></tr></thead>

              <tbody>

                {(card.submissions || []).map((s: any) => (

                  <tr key={s.id}>

                    <td>{s.taskTitle}</td>

                    <td>{label(s.status)}</td>

                    <td style={{ maxWidth: 280, fontSize: 12 }}>
                      {s.answerText?.trim() ? <div>{s.answerText}</div> : null}
                      {s.postUrl ? (
                        <div><a href={s.postUrl} target="_blank" rel="noreferrer">Ссылка на пост</a></div>
                      ) : null}
                      {s.photoUrl ? (
                        <div>
                          <a href={s.photoUrl} target="_blank" rel="noreferrer">Фото</a>
                        </div>
                      ) : null}
                      {!s.answerText?.trim() && !s.postUrl && !s.photoUrl ? '—' : null}
                    </td>

                    <td>{s.pointsAwarded ?? 0}</td>

                    <td style={{ fontSize: 11 }}>

                      {(s.teamConfirmations || []).map((c: any) => `${c.name || c.participantId}: ${label(c.status)}`).join(' · ') || '—'}

                    </td>

                    <td>
                      {(s.status === 'approved' || s.status === 'pending' || s.status === 'pending_team') && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-secondary"
                          style={{ fontSize: 11 }}
                          onClick={() => act(
                            () => adminFetch(`/participants/${p.id}/task-submissions/${s.id}/revoke`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ reason: 'Отмена выполнения администратором' }),
                            }).then(() => { onReloadCard(); }),
                            'Задание отменено: баллы сняты, можно пройти снова',
                          )}
                        >
                          Отменить
                        </button>
                      )}
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>
            </>
          )}

          {tab === 'points' && (

            <div className="adm-stack">

            <div className="card" style={{ padding: 12, fontSize: 13 }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

                <div>

                  <div className="adm-muted" style={{ fontSize: 12, marginBottom: 4 }}>Общий рейтинг</div>

                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{ratingShown}</div>

                  <div className="adm-muted" style={{ marginTop: 6, fontSize: 12 }}>

                    {pointsFilter === 'all'
                      ? `Путь ${card.pointsSummary?.path ?? p.pathPoints ?? 0} · Опыт ${card.pointsSummary?.experience ?? p.experiencePoints ?? 0} · Бонус ${card.pointsSummary?.bonus ?? 0}`
                      : `В журнале (фильтр): ${filteredPointsSum} · показано записей: ${filteredPoints.length}`}

                  </div>

                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>

                  {([
                    ['all', 'Все'],
                    ['path', 'Путь'],
                    ['experience', 'Опыт'],
                    ['bonus', 'Бонус'],
                  ] as const).map(([key, title]) => (

                    <button

                      key={key}

                      type="button"

                      className={`adm-chip-btn${pointsFilter === key ? ' on' : ''}`}

                      onClick={() => setPointsFilter(key)}

                    >

                      {title}

                      {key !== 'all' && (
                        <span style={{ marginLeft: 6, opacity: 0.85 }}>
                          {key === 'path'
                            ? (card.pointsSummary?.path ?? 0)
                            : key === 'experience'
                              ? (card.pointsSummary?.experience ?? 0)
                              : (card.pointsSummary?.bonus ?? 0)}
                        </span>
                      )}

                    </button>

                  ))}

                </div>

              </div>

              {Object.keys(card.pointsSummary?.byDay || {}).length > 0 && pointsFilter === 'all' && (

                <div className="adm-muted" style={{ marginTop: 10 }}>

                  По дням: {Object.entries(card.pointsSummary!.byDay).sort((a, b) => Number(a[0]) - Number(b[0])).map(([d, pts]) => `Д${d}: ${pts}`).join(' · ')}

                </div>

              )}

            </div>

            {pointsAudit && (

              <div
                className="card"
                style={{
                  padding: 12,
                  fontSize: 13,
                  borderColor: pointsAudit.ok
                    ? (pointsAudit.issues.some(i => i.severity === 'warn') ? '#D69E2E' : '#2F855A')
                    : '#C53030',
                }}
              >

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>

                  <h4 style={{ margin: 0 }}>
                    Проверка баллов:{' '}
                    {pointsAudit.ok
                      ? (pointsAudit.issues.some(i => i.severity === 'warn') ? 'есть предупреждения' : 'всё сходится')
                      : 'есть расхождения'}
                  </h4>

                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => {
                      act(async () => {
                        await adminFetch(`/participants/${p.id}/points/recalculate`, { method: 'POST', body: '{}' });
                        onReloadCard();
                      }, 'Пересчитано из журнала');
                    }}
                  >
                    Пересчитать из журнала
                  </button>

                </div>

                <div style={{ marginTop: 8 }} className="adm-muted">
                  В карточке: Путь {pointsAudit.stored.path} · Опыт {pointsAudit.stored.experience} · Бонус {pointsAudit.stored.bonus} · всего {pointsAudit.stored.total}
                  <br />
                  По журналу: Путь {pointsAudit.fromLog.path} · Опыт {pointsAudit.fromLog.experience} · Бонус {pointsAudit.fromLog.bonus} · всего {pointsAudit.fromLog.total}
                  {' · '}записей {pointsAudit.logRows}{pointsAudit.revokedRows ? ` · аннулировано ${pointsAudit.revokedRows}` : ''}
                </div>

                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {pointsAudit.issues.map((issue) => (
                    <li
                      key={`${issue.code}-${issue.message}`}
                      style={{
                        color: issue.severity === 'error' ? '#C53030' : issue.severity === 'warn' ? '#B7791F' : '#276749',
                        marginBottom: 4,
                      }}
                    >
                      {issue.message}
                    </li>
                  ))}
                </ul>

                {pointsAudit.byAction.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer' }}>Сводка по типам действий</summary>
                    <table className="adm-table" style={{ marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th>Тип</th>
                          <th>Линия</th>
                          <th>Записей</th>
                          <th>Баллы</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pointsAudit.byAction
                          .filter((row) => pointsFilter === 'all' || row.track === pointsFilter)
                          .map((row) => (
                            <tr key={row.actionType}>
                              <td>{label(row.actionType)}</td>
                              <td>{pointsTrackLabel(row.track)}</td>
                              <td>{row.count}</td>
                              <td>{row.points}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </details>
                )}

              </div>

            )}

            <div className="card" style={{ padding: 12 }}>

              <h4 style={{ marginTop: 0 }}>Добавить / снять баллы</h4>

              <div className="adm-forum-grid-2">

                <label className="adm-field">

                  <span className="adm-label">Линия</span>

                  <select className="adm-input" value={pointsTrack} onChange={e => setPointsTrack(e.target.value as 'path' | 'experience')}>

                    <option value="path">Путь</option>

                    <option value="experience">Опыт</option>

                  </select>

                </label>

                <label className="adm-field">

                  <span className="adm-label">Сумма</span>

                  <input type="number" min={1} className="adm-input" value={pointsAmount} onChange={e => setPointsAmount(Math.max(1, Number(e.target.value) || 1))} />

                </label>

                <label className="adm-field" style={{ gridColumn: '1 / -1' }}>

                  <span className="adm-label">Причина</span>

                  <input className="adm-input" value={pointsReason} onChange={e => setPointsReason(e.target.value)} />

                </label>

              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

                <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => {

                  if (!pointsReason.trim()) { alert('Укажите причину'); return; }

                  act(async () => {

                    await adminFetch(`/participants/${p.id}/points/adjust`, { method: 'POST', body: JSON.stringify({ points: pointsAmount, track: pointsTrack, reason: pointsReason.trim() }) });

                    setPointsReason('');

                    onReloadCard();

                  }, 'Начислено');

                }}>Добавить баллы</button>

                <button type="button" className="adm-btn btn-danger adm-btn-sm" onClick={() => {

                  if (!pointsReason.trim()) { alert('Укажите причину'); return; }

                  act(async () => {

                    await adminFetch(`/participants/${p.id}/points/adjust`, { method: 'POST', body: JSON.stringify({ points: -pointsAmount, track: pointsTrack, reason: pointsReason.trim() }) });

                    setPointsReason('');

                    onReloadCard();

                  }, 'Списано');

                }}>Снять баллы</button>

              </div>

            </div>

            <div className="card" style={{ padding: 12 }}>

              <h4 style={{ marginTop: 0 }}>Аннулировать подозрительные</h4>

              <div className="adm-forum-grid-2">

                <label className="adm-field">

                  <span className="adm-label">День смены</span>

                  <input type="number" min={1} max={8} className="adm-input" value={bulkForumDay} onChange={e => setBulkForumDay(e.target.value === '' ? '' : Number(e.target.value))} />

                </label>

                <label className="adm-field">

                  <span className="adm-label">Причина</span>

                  <input className="adm-input" value={bulkReason} onChange={e => setBulkReason(e.target.value)} />

                </label>

              </div>

              <button type="button" className="adm-btn btn-danger adm-btn-sm" onClick={() => {

                if (!bulkReason.trim()) { alert('Укажите причину'); return; }

                if (!confirm('Аннулировать начисления за выбранный день?')) return;

                act(async () => {

                  await adminFetch(`/participants/${p.id}/points/revoke-bulk`, {

                    method: 'POST',

                    body: JSON.stringify({ reason: bulkReason.trim(), notify: true, forumDay: bulkForumDay === '' ? undefined : Number(bulkForumDay) }),

                  });

                  setBulkReason('');

                  onReloadCard();

                }, 'Готово');

              }}>Аннулировать подозрительные</button>

            </div>

            <table className="adm-table">

              <thead>
                <tr>
                  {([
                    ['track', 'Линия'],
                    ['type', 'Тип'],
                    ['source', 'За что / текст'],
                    ['points', 'Баллы'],
                    ['when', 'Когда'],
                  ] as const).map(([key, title]) => (
                    <th key={key}>
                      <button
                        type="button"
                        className="adm-link"
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', fontWeight: 700 }}
                        onClick={() => togglePointsSort(key)}
                      >
                        {title}{pointsSortMark(key)}
                      </button>
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>

              <tbody>

                {sortedPoints.length === 0 && (
                  <tr>
                    <td colSpan={6} className="adm-muted">Нет начислений для выбранного фильтра</td>
                  </tr>
                )}

                {sortedPoints.map((pt: any) => (

                  <tr key={pt.id} style={pt.revokedAt ? { opacity: 0.5 } : undefined}>

                    <td>{pointsTrackLabel(pt.track)}</td>

                    <td>{label(pt.actionType)}</td>

                    <td style={{ maxWidth: 420, fontSize: 12 }}>
                      {pt.sourceTitle || pt.answerPreview || pt.sourceDescription ? (
                        <>
                          {pt.sourceTitle && (
                            <div style={{ fontWeight: 700 }}>
                              {pt.sourceKind === 'piggybank'
                                ? pt.sourceTitle
                                : `${pointsSourceKindLabel(pt.sourceKind)}: ${pt.sourceTitle}`}
                            </div>
                          )}
                          {pt.sourceDescription && (
                            <div style={{ marginTop: 4, color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>
                              {pt.sourceDescription}
                            </div>
                          )}
                          {pt.answerPreview && (
                            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>
                              <span className="adm-muted">{pointsContentLabel(pt.sourceKind)}: </span>
                              {pt.answerPreview}
                            </div>
                          )}
                          {pt.revokedAt && (
                            <div className="adm-muted" style={{ marginTop: 4 }}>
                              Аннулировано{pt.revokeReason ? `: ${pt.revokeReason}` : ''}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="adm-muted">{pt.revokeReason || '—'}</span>
                      )}
                    </td>

                    <td>{pt.points}</td>

                    <td>{pt.createdAt ? new Date(pt.createdAt).toLocaleString('ru-RU') : ''}</td>

                    <td>

                      {pt.canRevoke && (

                        <button

                          type="button"

                          className="adm-btn adm-btn-danger adm-btn-sm"

                          onClick={() => {

                            const reason = prompt('Причина аннулирования') || 'Подозрительное начисление';

                            act(async () => {

                              await adminFetch(`/participants/${p.id}/points/${pt.id}/revoke`, {

                                method: 'POST',

                                body: JSON.stringify({ reason }),

                              });

                              onReloadCard();

                            }, 'Баллы аннулированы');

                          }}

                        >

                          Аннулировать

                        </button>

                      )}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            </div>

          )}

          {tab === 'medals' && (

            <div className="adm-stack">

            <div className="card" style={{ padding: 12 }}>

              <h4 style={{ marginTop: 0 }}>Выдать медаль</h4>

              <div className="adm-forum-grid-2">

                <select className="adm-input" value={awardMedalId === '' ? '' : String(awardMedalId)} onChange={e => setAwardMedalId(e.target.value ? Number(e.target.value) : '')}>

                  <option value="">— выберите медаль —</option>

                  {medalCatalog
                    .filter(m => !(card.medals || []).some((um: { medalId?: number }) => um.medalId === m.id))
                    .map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}

                </select>

                <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" disabled={awardMedalId === ''} onClick={() => {

                  act(async () => {

                    await adminFetch('/medals/award', { method: 'POST', body: JSON.stringify({ participantId: p.id, medalId: awardMedalId }) });

                    setAwardMedalId('');

                    onReloadCard();

                  }, 'Медаль выдана');

                }}>Выдать</button>

              </div>

            </div>

            {(card.medalProgress || []).filter((m: any) => !m.earned).length > 0 && (

              <div className="card" style={{ padding: 12 }}>

                <h4 style={{ marginTop: 0 }}>Ещё не получены</h4>

                <ul className="adm-list">

                  {(card.medalProgress || []).filter((m: { earned?: boolean }) => !m.earned).map((m: {
                    id: number;
                    name: string;
                    level?: string;
                    current?: number;
                    target?: number;
                    conditionLabel?: string;
                  }) => (
                    <li key={m.id} className="adm-muted">
                      {m.name} ({label(m.level ?? '')})
                      {m.target != null && m.current != null
                        ? ` · ${m.current} / ${m.target}${m.conditionLabel ? ` (${m.conditionLabel})` : ''}`
                        : ''}
                    </li>
                  ))}

                </ul>

              </div>

            )}

            <ul className="adm-list">

              {(card.medals || []).map((m: any) => (

                <li key={m.id}>{m.name} ({label(m.level)}){m.awardedAt ? ` · ${new Date(m.awardedAt).toLocaleDateString('ru-RU')}` : ''}</li>

              ))}

              {(card.medals || []).length === 0 && <li className="adm-muted">Нет медалей</li>}

            </ul>

            </div>

          )}

          {tab === 'piggybank' && (

            <>

            <div className="adm-forum-toolbar" style={{ marginBottom: 8, flexWrap: 'wrap' }}>

              <select className="adm-input" value={piggyTagFilter} onChange={e => setPiggyTagFilter(e.target.value)}>

                <option value="">Все теги</option>

                {[...new Set((card.piggybank || []).map((e: any) => e.tag).filter(Boolean))].map((t: any) => (

                  <option key={t} value={String(t)}>{label(t) || t}</option>

                ))}

              </select>

              <select className="adm-input" value={piggySourceFilter} onChange={e => setPiggySourceFilter(e.target.value)}>

                <option value="">Все источники</option>

                {[...new Set((card.piggybank || []).map((e: any) => e.source).filter(Boolean))].map((s: any) => (

                  <option key={s} value={String(s)}>{label(s) || s}</option>

                ))}

              </select>

              <select className="adm-input" value={piggyDayFilter} onChange={e => setPiggyDayFilter(e.target.value)}>

                <option value="">Все дни</option>

                {[...new Set((card.piggybank || []).map((e: any) => e.forumDay).filter(v => v != null))].sort().map((d: any) => (

                  <option key={d} value={String(d)}>День {d}</option>

                ))}

              </select>

            </div>

            <ul className="adm-list">

              {(card.piggybank || []).filter((e: any) => {

                if (piggyTagFilter && String(e.tag || '') !== piggyTagFilter) return false;

                if (piggySourceFilter && String(e.source || '') !== piggySourceFilter) return false;

                if (piggyDayFilter && String(e.forumDay ?? '') !== piggyDayFilter) return false;

                return true;

              }).map((e: any) => (

                <li key={e.id}><strong>{label(e.tag) || e.tag}</strong> · {label(e.source) || e.source}: {(e.text || '').slice(0, 120)}</li>

              ))}

            </ul>

            </>

          )}

        </div>

      </div>

    </div>

    <ParticipantFinalProfileModal
      open={finalProfileOpen}
      participantId={p.id}
      participantName={displayName}
      onClose={() => setFinalProfileOpen(false)}
    />
    <ParticipantAnalyticalProfileModal
      open={analyticalProfileOpen}
      participantId={p.id}
      participantName={displayName}
      onClose={() => setAnalyticalProfileOpen(false)}
    />
    <ParticipantDataDrivenProfileModal
      open={dataDrivenProfileOpen}
      participantId={p.id}
      participantName={displayName}
      onClose={() => setDataDrivenProfileOpen(false)}
    />
    {copyTargetId != null && (
      <div className="adm-modal-backdrop" onClick={() => setCopyTargetId(null)} role="presentation">
        <div className="card adm-kb-panel" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
          <div className="adm-kb-panel-head">
            <h3>Копировать в смену</h3>
            <p className="adm-kb-panel-sub">
              Копируется только участник, без прогресса и анкеты. При первом входе он выберет смену.
            </p>
          </div>
          <label className="adm-field">
            <span className="adm-label">Целевая смена</span>
            <select
              className="adm-input"
              value={copyTargetId}
              onChange={e => setCopyTargetId(Number(e.target.value))}
            >
              {shiftOptions
                .filter(s => s.id !== currentShiftId)
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}){s.status === 'active' ? ' · активная' : ''}
                  </option>
                ))}
            </select>
          </label>
          <div className="adm-mod-item-actions">
            <button
              type="button"
              className="adm-btn adm-btn-primary adm-btn-sm"
              onClick={() => {
                const target = shiftOptions.find(s => s.id === copyTargetId);
                if (!target) return;
                if (!confirm(
                  `Добавить ${displayName} в смену «${target.name}» без прогресса и анкеты?`,
                )) return;
                act(async () => {
                  const res = await adminFetch('/participants/copy-to-shift', {
                    method: 'POST',
                    body: JSON.stringify({
                      participantIds: [p.id],
                      targetShiftId: copyTargetId,
                    }),
                  });
                  setCopyTargetId(null);
                  return res.message || 'Скопирован в смену';
                }, 'Скопирован в смену');
              }}
            >
              Копировать
            </button>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setCopyTargetId(null)}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );

}



export async function fetchParticipantCard(adminFetch: (p: string) => Promise<any>, id: number) {

  return adminFetch(`/participants/${id}/card`);

}


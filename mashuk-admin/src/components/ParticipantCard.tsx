import React, { useEffect, useState } from 'react';

import { adminDownloadBinary } from '../admin/client';
import { CONFIRM_BLOCK_PARTICIPANT, CONFIRM_DELETE_PARTICIPANT, CONFIRM_REMOVE_FROM_PROGRAM, confirmDelete } from '../admin/confirmDelete';
import { label } from '../labels/ru';
import { formatAnswerPreview } from '../utils/formatAnswerPreview';

import { VkProfileLink } from './VkProfileLink';
import { ParticipantAvatar } from './participants/ParticipantAvatar';



type CardData = {

  participant?: {

    id: number;

    firstName?: string;

    lastName?: string;

    vkId?: string;

    direction?: string;

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

  piggybank?: any[];

  dayStates?: any[];

  avatarUrl?: string | null;

};



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

}: {

  card: CardData;

  tab: string;

  setTab: (t: string) => void;

  onClose: () => void;

  onReloadCard: () => void;

  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;

  act: (fn: () => Promise<void>, msg?: string) => void;

  roleOptions: { key: string; name: string }[];

}) {

  const p = card.participant!;
  const [taskCatalog, setTaskCatalog] = useState<{ id: number; title?: string }[]>([]);
  const [manualTaskId, setManualTaskId] = useState('');

  useEffect(() => {
    if (tab !== 'tasks' || !p?.id) return;
    adminFetch('/tasks')
      .then((res: { tasks?: { id: number; title?: string }[] }) => {
        setTaskCatalog(res.tasks ?? []);
      })
      .catch(() => setTaskCatalog([]));
  }, [tab, p?.id, adminFetch]);

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

  const [pointsTrack, setPointsTrack] = useState<'path' | 'experience'>('path');
  const [pointsAmount, setPointsAmount] = useState(10);
  const [pointsReason, setPointsReason] = useState('');
  const [bulkForumDay, setBulkForumDay] = useState<number | ''>('');
  const [bulkReason, setBulkReason] = useState('');
  const [medalCatalog, setMedalCatalog] = useState<{ id: number; name: string; level?: string }[]>([]);
  const [awardMedalId, setAwardMedalId] = useState<number | ''>('');

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
    const token = sessionStorage.getItem('mashuk_admin_token');
    const res = await fetch(`${base}/participants/${p.id}/pdf-preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };



  const displayName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Участник';

  return (

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
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setTab('profile')}>Скорректировать роль</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => setTab('points')}>Начислить/снять баллы</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => {
              const text = prompt('Текст пуша');
              if (!text?.trim()) return;
              act(() => adminFetch(`/participants/${p.id}/push`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) }), 'Пуш отправлен');
            }}>Отправить пуш</button>
            <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => act(() => adminDownloadBinary(`/participants/${p.id}/pdf`, `profile_${p.id}.pdf`), 'PDF')}>Выгрузить всё</button>
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

              <div className="adm-field-row">Сильная / рост: {p.strongRole || '—'} / {p.growthRole || '—'}</div>

              <div className="adm-field-row">
                Согласия: ПД {p.consentPd ? 'да' : 'нет'} · аналитика {p.consentAnalytics ? 'да' : 'нет'}
              </div>

              {p.workplace && <div className="adm-field-row">Место работы: {p.workplace}</div>}
              {p.position && <div className="adm-field-row">Должность: {p.position}</div>}
              {p.region && <div className="adm-field-row">Регион: {p.region}</div>}

              {p.interests != null && (
                <div className="adm-field-row">
                  Интересы: {Array.isArray(p.interests) ? (p.interests as string[]).join(', ') : JSON.stringify(p.interests)}
                </div>
              )}

              {p.createdAt && (
                <div className="adm-field-row">Регистрация: {new Date(p.createdAt).toLocaleString('ru-RU')}</div>
              )}

              {p.age != null && (
                <div className="adm-field-row">Возраст: {p.age}</div>
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

                  {it.detail && <div style={{ marginTop: 4 }}>{it.detail}</div>}

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
            <div className="adm-forum-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
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
                  () => adminFetch(`/participants/${p.id}/tasks/${manualTaskId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ comment: 'Отмечено в карточке участника' }),
                  }).then(() => { onReloadCard(); }),
                  'Задание отмечено',
                )}
              >
                Отметить выполненным
              </button>
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
                            'Выполнение отменено',
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

            {card.pointsSummary && (

              <div className="card" style={{ padding: 12, fontSize: 13 }}>

                <strong>Сводка:</strong> Путь {card.pointsSummary.path} · Опыт {card.pointsSummary.experience} · Бонус {card.pointsSummary.bonus} · всего {card.pointsSummary.total}

                {Object.keys(card.pointsSummary.byDay || {}).length > 0 && (

                  <div className="adm-muted" style={{ marginTop: 6 }}>

                    По дням: {Object.entries(card.pointsSummary.byDay).sort((a, b) => Number(a[0]) - Number(b[0])).map(([d, pts]) => `Д${d}: ${pts}`).join(' · ')}

                  </div>

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

              <thead><tr><th>Тип</th><th>Баллы</th><th>Когда</th><th></th></tr></thead>

              <tbody>

                {(card.points || []).map((pt: any) => (

                  <tr key={pt.id} style={pt.revokedAt ? { opacity: 0.5 } : undefined}>

                    <td>{label(pt.actionType)}</td>

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

  );

}



export async function fetchParticipantCard(adminFetch: (p: string) => Promise<any>, id: number) {

  return adminFetch(`/participants/${id}/card`);

}


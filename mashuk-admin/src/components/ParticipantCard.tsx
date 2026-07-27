import React, { useEffect, useState } from 'react';

import { label } from '../labels/ru';

import { VkProfileLink } from './VkProfileLink';



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

    outcomesEdited?: unknown;

    nextStepsEdited?: unknown;

  };

  answers?: any[];

  submissions?: any[];

  points?: any[];

  medals?: any[];

  piggybank?: any[];

  dayStates?: any[];

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

  const initials = `${(p.firstName || '?')[0]}${(p.lastName || '?')[0]}`.toUpperCase();

  const tabs = ['profile', 'answers', 'tasks', 'points', 'medals', 'piggybank'] as const;

  const tabLabels: Record<string, string> = {

    profile: 'Профиль',

    answers: 'Ответы',

    tasks: 'Задания',

    points: 'Баллы',

    medals: 'Медали',

    piggybank: 'Копилка',

  };



  const [outcomesText, setOutcomesText] = useState('');

  const [nextStepsText, setNextStepsText] = useState('');

  const [pdfOutcomes, setPdfOutcomes] = useState('');

  const [pdfNextSteps, setPdfNextSteps] = useState('');



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



  return (

    <div className="adm-modal-backdrop" onClick={onClose} role="presentation">

      <div className="adm-modal adm-participant-card" onClick={e => e.stopPropagation()}>

        <div className="adm-pc-hero">

          <button type="button" className="adm-btn adm-btn-ghost adm-pc-close" onClick={onClose}>✕</button>

          <div className="adm-pc-avatar">{initials}</div>

          <div className="adm-pc-name">{p.firstName} {p.lastName}</div>

          <div className="adm-pc-meta">{p.direction || '—'}{p.groupName ? ` · ${p.groupName}` : ''}</div>

          <div className="adm-pc-chips">

            <span className="adm-chip">📍 {p.pathPoints ?? 0}</span>

            <span className="adm-chip adm-chip-accent">⚡ {p.experiencePoints ?? 0}</span>

          </div>

        </div>

        <div className="adm-seg">

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

            <table className="adm-table">

              <thead><tr><th>Вопрос</th><th>День</th><th>Ответ</th></tr></thead>

              <tbody>

                {(card.answers || []).slice(0, 50).map((a: any) => (

                  <tr key={a.id}>

                    <td>{a.questionTitle}</td>

                    <td>{a.dayNumber ?? '—'}</td>

                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData)}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          )}

          {tab === 'tasks' && (

            <table className="adm-table">

              <thead><tr><th>Задание</th><th>Статус</th><th>Ответ</th><th>XP</th><th>Команда</th></tr></thead>

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

                  </tr>

                ))}

              </tbody>

            </table>

          )}

          {tab === 'points' && (

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

          )}

          {tab === 'medals' && (

            <ul className="adm-list">

              {(card.medals || []).map((m: any) => (

                <li key={m.id}>{m.name} ({label(m.level)})</li>

              ))}

              {(card.medals || []).length === 0 && <li className="adm-muted">Нет медалей</li>}

            </ul>

          )}

          {tab === 'piggybank' && (

            <ul className="adm-list">

              {(card.piggybank || []).map((e: any) => (

                <li key={e.id}><strong>{label(e.tag) || e.tag}</strong> · {label(e.source) || e.source}: {(e.text || '').slice(0, 120)}</li>

              ))}

            </ul>

          )}

        </div>

      </div>

    </div>

  );

}



export async function fetchParticipantCard(adminFetch: (p: string) => Promise<any>, id: number) {

  return adminFetch(`/participants/${id}/card`);

}


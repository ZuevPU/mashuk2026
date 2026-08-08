import { useState } from 'react';
import type { QuestionDraft } from './types';
import { answerTypeLabel, kindLabel } from './types';
import { ParticipantPreviewFrame } from '../admin/ParticipantPreviewModal';

const EMOTIONS = ['😊', '😌', '🤔', '✨', '💪', '😴'];

export function QuestionParticipantPreview({ draft }: { draft: QuestionDraft }) {
  const isPractices = draft.questionKind === 'practices_vote' || draft.answerType === 'practices_vote';
  const [liked, setLiked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const displayTitle = isPractices
    ? (draft.title.trim() || 'Голосование за практики')
    : (draft.text.trim() || draft.title);
  const quota = Math.max(1, draft.practicesConfig.likesPerParticipant || 1);
  const remaining = Math.max(0, quota - liked.length);
  const practices = draft.practicesConfig.practices
    .filter(p => p.title.trim() || p.description.trim() || p.participantName.trim())
    .map(p => ({ ...p, title: p.title.trim() || 'Без названия' }));

  return (
    <ParticipantPreviewFrame>
      <div style={{ fontSize: 12, color: '#666' }}>{kindLabel(draft.questionKind)} · {answerTypeLabel(draft.answerType)}</div>
      {draft.subtitle && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{draft.subtitle}</div>}
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{displayTitle}</div>

      {isPractices && (
        <div style={{ marginTop: 12 }}>
          {draft.practicesConfig.preamble && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 12,
              background: '#F5F0E8',
              fontSize: 13,
              lineHeight: 1.45,
            }}>
              {draft.practicesConfig.preamble}
            </div>
          )}
          {practices.length === 0 && (
            <div style={{ fontSize: 12, color: '#B8621A', marginBottom: 8, lineHeight: 1.4 }}>
              Нет практик с названием. Заполните таблицу ниже — тогда появятся карточки и лайки.
            </div>
          )}
          {draft.practicesConfig.resultsPublished ? (
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #E0DAD0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F5F0E8', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Практика</th>
                    <th style={{ padding: 8 }}>Участник</th>
                    <th style={{ padding: 8 }}>Место</th>
                    <th style={{ padding: 8 }}>Время</th>
                  </tr>
                </thead>
                <tbody>
                  {practices.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #EDE7DC' }}>
                      <td style={{ padding: 8 }}>{p.title}</td>
                      <td style={{ padding: 8 }}>{p.participantName || '—'}</td>
                      <td style={{ padding: 8 }}>{p.resultPlace || 'уточняется'}</td>
                      <td style={{ padding: 8 }}>{p.resultTime || 'уточняется'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Осталось лайков: {remaining} из {quota}
              </div>
              {practices.map(p => {
                const isOpen = !!expanded[p.id];
                const isLiked = liked.includes(p.id);
                return (
                  <div
                    key={p.id}
                    style={{
                      marginBottom: 8,
                      borderRadius: 12,
                      border: isLiked ? '2px solid #FF5500' : '1px solid #E0DAD0',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      style={{
                        width: '100%',
                        display: 'flex',
                        gap: 8,
                        padding: 10,
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.title}</div>
                        {(p.participantName || p.direction) && (
                          <div style={{ fontSize: 11, color: '#666' }}>
                            {[p.participantName, p.direction].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <span style={{ color: '#888', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 10px 10px' }}>
                        {p.description && (
                          <div style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{p.description}</div>
                        )}
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm"
                          disabled={!isLiked && remaining <= 0}
                          onClick={() => setLiked(prev => {
                            if (prev.includes(p.id)) return prev.filter(x => x !== p.id);
                            if (prev.length >= quota) return prev;
                            return [...prev, p.id];
                          })}
                        >
                          {isLiked ? '♥ Лайк снять' : '♡ Лайк'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Превью · сохранение только в приложении</div>
            </>
          )}
        </div>
      )}

      {!isPractices && draft.answerType === 'text' && (
        <textarea readOnly placeholder="Ваш ответ…" style={{ width: '100%', marginTop: 12, minHeight: 72, borderRadius: 8, padding: 8 }} />
      )}
      {!isPractices && (draft.answerType === 'scale_5' || draft.answerType === 'scale_10') && (
        <div style={{ marginTop: 12 }}>
          <input type="range" min={1} max={draft.answerType === 'scale_5' ? 5 : 10} defaultValue={3} style={{ width: '100%' }} />
        </div>
      )}
      {!isPractices && draft.answerType === 'emotion' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {EMOTIONS.map(e => (
            <span key={e} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 }}>{e}</span>
          ))}
        </div>
      )}
      {!isPractices && (draft.answerType === 'choice' || draft.answerType === 'multi') && (
        <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none' }}>
          {(draft.options.length ? draft.options : [{ label: 'Вариант 1', value: '1' }]).map((o, i) => (
            <li key={i} style={{ padding: '8px 10px', border: '1px solid #E0DAD0', borderRadius: 8, marginBottom: 6 }}>
              {draft.answerType === 'multi' ? '☐' : '○'} {o.label}
            </li>
          ))}
        </ul>
      )}
      {draft.isRequired && <div style={{ fontSize: 11, color: '#C53030', marginTop: 8 }}>Обязательный вопрос</div>}
      {draft.points > 0 && <div style={{ fontSize: 11, color: '#2D6A4F', marginTop: 4 }}>+{draft.points} к Пути</div>}
    </ParticipantPreviewFrame>
  );
}

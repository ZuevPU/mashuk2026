import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { QuestionDraft } from './types';
import { answerTypeLabel, kindLabel } from './types';
import {
  buildEveningProgramPickNodes,
  type ProgramEventRow,
  type ProgramPickNode,
} from '../forum/programEventTree';

const EMOTIONS = [
  { id: 'joy', label: 'Радость', icon: '😊' },
  { id: 'calm', label: 'Спокойствие', icon: '😌' },
  { id: 'interest', label: 'Интерес', icon: '🤔' },
  { id: 'inspiration', label: 'Вдохновение', icon: '✨' },
  { id: 'confidence', label: 'Уверенность', icon: '💪' },
  { id: 'tired', label: 'Усталость', icon: '😴' },
];

const MIN_REFLECTION_CHARS = 20;

type Props = {
  draft: QuestionDraft;
  programEvents?: ProgramEventRow[];
};

function formatTimeRange(start?: string | null, end?: string | null): string {
  const fmt = (raw?: string | null) => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a}–${b}`;
  return a || b || '';
}

function PickCard({
  title,
  meta,
  selected,
  onClick,
}: {
  title: string;
  meta?: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        marginBottom: 6,
        borderRadius: 12,
        border: selected ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
        background: selected ? '#D8F3DC' : '#fff',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
      {meta && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{meta}</div>}
    </button>
  );
}

function PreviewShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="adm-evening-preview-shell">
      <div className="adm-forum-preview-label">{label}</div>
      <div className="adm-evening-preview-phone">
        <div className="adm-evening-preview-card">{children}</div>
      </div>
    </div>
  );
}

function AfterBlocksPreview({
  draft,
  nodes,
}: {
  draft: QuestionDraft;
  nodes: ProgramPickNode[];
}) {
  const [parentId, setParentId] = useState<number | null>(null);
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [textIndex, setTextIndex] = useState(0);
  const [step, setStep] = useState<'event' | 'topic' | 'text'>('event');

  const resetKey = `${draft.dayNumbers.join(',')}|${draft.linkedEventIds.join(',')}|${nodes.map(n => n.id).join(',')}`;

  useEffect(() => {
    setParentId(null);
    setTopicIds([]);
    setTexts({});
    setTextIndex(0);
    setStep('event');
  }, [resetKey]);

  const parent = nodes.find(n => n.id === parentId) || null;
  const children = parent?.children || [];
  const topicPickNeeded = children.length > 1;
  const selectedTopics = (() => {
    if (!parent) return [] as ProgramPickNode[];
    if (children.length === 0) return [parent];
    return topicIds
      .map(id => children.find(c => c.id === id))
      .filter((c): c is ProgramPickNode => Boolean(c));
  })();
  const currentTopic = selectedTopics[textIndex] || null;
  const currentText = currentTopic ? (texts[currentTopic.id] || '') : '';
  const textOk = currentText.trim().length >= MIN_REFLECTION_CHARS;
  const isLastText = textIndex >= selectedTopics.length - 1;

  const topicStepsCount = topicPickNeeded ? 1 : 0;
  const textStepsCount = Math.max(selectedTopics.length, 1);
  const totalSteps = 1 + topicStepsCount + textStepsCount;
  const stepIndex = step === 'event'
    ? 1
    : step === 'topic'
      ? 2
      : (1 + topicStepsCount + textIndex + 1);

  const goAfterEventPick = (ev: ProgramPickNode) => {
    if (ev.children.length === 0) {
      setTopicIds([ev.id]);
      setTexts({});
      setTextIndex(0);
      setStep('text');
      return;
    }
    if (ev.children.length === 1) {
      setTopicIds([ev.children[0].id]);
      setTexts({});
      setTextIndex(0);
      setStep('text');
      return;
    }
    setTopicIds([]);
    setTexts({});
    setTextIndex(0);
    setStep('topic');
  };

  const title = draft.title.trim() || 'После блоков';
  const hint = draft.text.trim();

  return (
    <PreviewShell label={`Как у участника · ${kindLabel(draft.questionKind)}`}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 1.4 }}>{hint}</div>}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        Шаг {stepIndex} из {totalSteps}
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
        <div
          style={{
            width: `${(stepIndex / Math.max(totalSteps, 1)) * 100}%`,
            height: 4,
            background: '#2D6A4F',
            borderRadius: 4,
          }}
        />
      </div>

      {step === 'event' && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Где вы были?</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
            Выберите событие программы — параллельный блок, в котором вы участвовали.
          </div>
          {nodes.length === 0 && (
            <div style={{ fontSize: 12, color: '#B8621A', marginBottom: 8, lineHeight: 1.4 }}>
              Нет связанных событий. Отметьте блоки в поле «Связать с событиями программы»
              или добавьте события на выбранные дни.
            </div>
          )}
          {nodes.map(ev => (
            <PickCard
              key={ev.id}
              title={ev.title}
              meta={[
                formatTimeRange(ev.startTime, ev.endTime) || null,
                ev.children.length ? `${ev.children.length} подтем` : null,
              ].filter(Boolean).join(' · ') || null}
              selected={parentId === ev.id}
              onClick={() => {
                setParentId(ev.id);
                setTopicIds([]);
                setTexts({});
                setTextIndex(0);
              }}
            />
          ))}
          <button
            type="button"
            className="adm-evening-preview-btn primary"
            style={{ width: '100%', marginTop: 8 }}
            disabled={!parentId}
            onClick={() => {
              const next = nodes.find(e => e.id === parentId);
              if (!next) return;
              goAfterEventPick(next);
            }}
          >
            Далее
          </button>
        </>
      )}

      {step === 'topic' && parent && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, color: '#2D6A4F' }}>
            Событие: <b>{parent.title}</b>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            На каких подтемах вы были?
          </div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.4 }}>
            Можно выбрать несколько — дальше ответите по каждой по очереди.
          </div>
          {children.map(ev => (
            <PickCard
              key={ev.id}
              title={ev.title}
              meta={formatTimeRange(ev.startTime, ev.endTime) || null}
              selected={topicIds.includes(ev.id)}
              onClick={() => setTopicIds(prev => (
                prev.includes(ev.id) ? prev.filter(x => x !== ev.id) : [...prev, ev.id]
              ))}
            />
          ))}
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            Выбрано: {topicIds.length}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="adm-evening-preview-btn secondary" onClick={() => setStep('event')}>
              Назад
            </button>
            <button
              type="button"
              className="adm-evening-preview-btn primary"
              style={{ flex: 1 }}
              disabled={topicIds.length === 0}
              onClick={() => {
                setTexts({});
                setTextIndex(0);
                setStep('text');
              }}
            >
              Далее
            </button>
          </div>
        </>
      )}

      {step === 'text' && currentTopic && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, color: '#2D6A4F', lineHeight: 1.4 }}>
            {parent && parent.id !== currentTopic.id
              ? <>Событие: <b>{parent.title}</b><br />Подтема: <b>{currentTopic.title}</b></>
              : <>Событие: <b>{currentTopic.title}</b></>}
            {selectedTopics.length > 1 && (
              <div style={{ marginTop: 4, color: '#666' }}>
                Ответ {textIndex + 1} из {selectedTopics.length}
              </div>
            )}
          </div>
          <div className="adm-evening-preview-label">Что вынесли из этого блока?</div>
          <textarea
            value={currentText}
            onChange={e => setTexts(prev => ({ ...prev, [currentTopic.id]: e.target.value }))}
            placeholder="Своими словами: какая мысль запомнилась…"
            style={{
              width: '100%',
              minHeight: 88,
              borderRadius: 10,
              border: '1px solid #ddd',
              padding: 10,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: textOk ? '#888' : '#B8621A', margin: '6px 0 4px' }}>
            {currentText.trim().length < MIN_REFLECTION_CHARS
              ? `Ещё минимум ${MIN_REFLECTION_CHARS - currentText.trim().length} символов`
              : (isLastText ? 'Можно отправлять' : 'Можно перейти дальше')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="adm-evening-preview-btn secondary"
              onClick={() => {
                if (textIndex > 0) {
                  setTextIndex(i => i - 1);
                  return;
                }
                setStep(topicPickNeeded ? 'topic' : 'event');
              }}
            >
              Назад
            </button>
            {isLastText ? (
              <button
                type="button"
                className="adm-evening-preview-btn primary"
                style={{ flex: 1 }}
                disabled={!textOk}
                onClick={() => alert('В превью сохранение не отправляется')}
              >
                Отправить
              </button>
            ) : (
              <button
                type="button"
                className="adm-evening-preview-btn primary"
                style={{ flex: 1 }}
                disabled={!textOk}
                onClick={() => setTextIndex(i => i + 1)}
              >
                Далее
              </button>
            )}
          </div>
        </>
      )}
    </PreviewShell>
  );
}

function GenericQuestionPreview({ draft }: { draft: QuestionDraft }) {
  const isPractices = draft.questionKind === 'practices_vote' || draft.answerType === 'practices_vote';
  const [liked, setLiked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [choice, setChoice] = useState<string>('');
  const [multi, setMulti] = useState<string[]>([]);
  const [scale, setScale] = useState(3);
  const [emotion, setEmotion] = useState('');
  const [text, setText] = useState('');

  const displayTitle = isPractices
    ? (draft.title.trim() || 'Голосование за практики')
    : (draft.text.trim() || draft.title.trim() || 'Вопрос');
  const quota = Math.max(1, draft.practicesConfig.likesPerParticipant || 1);
  const remaining = Math.max(0, quota - liked.length);
  const practices = draft.practicesConfig.practices
    .filter(p => p.title.trim() || p.description.trim() || p.participantName.trim())
    .map(p => ({ ...p, title: p.title.trim() || 'Без названия' }));
  const options = draft.options.length
    ? draft.options
    : [{ label: 'Вариант 1', value: '1' }, { label: 'Вариант 2', value: '2' }];

  return (
    <PreviewShell label={`Как у участника · ${kindLabel(draft.questionKind)} · ${answerTypeLabel(draft.answerType)}`}>
      {draft.subtitle && (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>{draft.subtitle}</div>
      )}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{displayTitle}</div>

      {isPractices && (
        <div>
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
              Нет практик с названием. Заполните таблицу — тогда появятся карточки.
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
                      background: '#fff',
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
                        fontFamily: 'inherit',
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
            </>
          )}
        </div>
      )}

      {!isPractices && draft.answerType === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ваш ответ…"
          style={{
            width: '100%',
            minHeight: 88,
            borderRadius: 10,
            border: '1px solid #ddd',
            padding: 10,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      )}

      {!isPractices && (draft.answerType === 'scale_5' || draft.answerType === 'scale_10') && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Array.from(
            { length: draft.answerType === 'scale_5' ? 5 : 10 },
            (_, i) => i + 1,
          ).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setScale(n)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: scale === n ? '2px solid #2D6A4F' : '1px solid #ddd',
                background: scale === n ? '#D8F3DC' : '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {!isPractices && draft.answerType === 'emotion' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EMOTIONS.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEmotion(e.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: emotion === e.id ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                background: emotion === e.id ? '#D8F3DC' : '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {e.icon} {e.label}
            </button>
          ))}
        </div>
      )}

      {!isPractices && (draft.answerType === 'choice' || draft.answerType === 'multi' || draft.answerType === 'dependent') && (
        <div>
          {options.map((o, i) => {
            const value = o.value || o.label || String(i);
            const selected = draft.answerType === 'multi'
              ? multi.includes(value)
              : choice === value;
            return (
              <PickCard
                key={`${value}-${i}`}
                title={o.label || value}
                selected={selected}
                onClick={() => {
                  if (draft.answerType === 'multi') {
                    setMulti(prev => (
                      prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value]
                    ));
                  } else {
                    setChoice(value);
                  }
                }}
              />
            );
          })}
        </div>
      )}

      {draft.isRequired && (
        <div style={{ fontSize: 11, color: '#C53030', marginTop: 10 }}>Обязательный вопрос</div>
      )}
      {draft.points > 0 && (
        <div style={{ fontSize: 11, color: '#2D6A4F', marginTop: 4 }}>+{draft.points} к Пути</div>
      )}

      <button
        type="button"
        className="adm-evening-preview-btn primary"
        style={{ width: '100%', marginTop: 14 }}
        onClick={() => alert('В превью сохранение не отправляется')}
      >
        Отправить
      </button>
    </PreviewShell>
  );
}

export function QuestionParticipantPreview({ draft, programEvents = [] }: Props) {
  const isAfterBlocks = draft.questionKind === 'after_blocks' || draft.reflectionKind === 'after_blocks';

  const nodes = useMemo(() => {
    if (!isAfterBlocks) return [];
    const day = draft.dayNumbers[0] ?? 1;
    return buildEveningProgramPickNodes(
      programEvents,
      day,
      draft.linkedEventIds.length ? draft.linkedEventIds : null,
    );
  }, [isAfterBlocks, programEvents, draft.dayNumbers, draft.linkedEventIds]);

  if (isAfterBlocks) {
    return <AfterBlocksPreview draft={draft} nodes={nodes} />;
  }

  return <GenericQuestionPreview draft={draft} />;
}

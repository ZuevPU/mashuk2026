import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { formatEmotionName, formatForumDay, formatZoneName } from '../analytics/chartRu';
import { DashCard, SectionLabel, dashVal } from '../analytics/dashboardUi';

type StateCheckItem = {
  kind: 'state_check';
  phase: string;
  emotion: string | null;
  emotionZone: string | null;
  energy: number | null;
  answer: string;
  timePoint: string | null;
  questionTitle: string;
};

type AfterBlocksItem = {
  kind: 'after_blocks';
  answer: string;
  questionTitle: string;
  eventTitle: string | null;
  parentEventTitle: string | null;
};

type EveningItem = {
  kind: 'evening';
  ratings: Record<string, unknown>;
  status: string;
  source: string;
};

type PiggyItem = {
  kind: 'piggybank';
  text: string;
  tags: string[];
  source: string | null;
};

type FeedItem = StateCheckItem | AfterBlocksItem | EveningItem | PiggyItem;

type DayBucket = { day: number; items: FeedItem[]; count: number };

const PHASE_LABEL: Record<string, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
  other: 'Точка',
};

function itemTitle(item: FeedItem): string {
  if (item.kind === 'state_check') {
    return `Проверка состояния · ${PHASE_LABEL[item.phase] || item.phase}`;
  }
  if (item.kind === 'after_blocks') {
    const parent = (item.parentEventTitle || '').trim();
    const topic = (item.eventTitle || '').trim();
    if (parent && topic && parent !== topic) return `После блоков · ${parent} → ${topic}`;
    return `После блоков · ${topic || parent || item.questionTitle || 'рефлексия'}`;
  }
  if (item.kind === 'evening') return `Итоговая анкета · ${item.status}`;
  return 'Копилка';
}

/** Посуточная лента «день из жизни». */
export function ParticipantDayTimeline({ participantId }: { participantId: number }) {
  const { adminFetch, forumDay } = useInsights();
  const [days, setDays] = useState<DayBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlySelectedDay, setOnlySelectedDay] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('participantId', String(participantId));
    params.set('mode', 'shift');
    if (onlySelectedDay && forumDay) params.set('day', forumDay);
    adminFetch(`/analytics/hub/participant-feed?${params.toString()}`)
      .then(res => {
        const body = res as { days?: DayBucket[] };
        setDays(body.days ?? []);
      })
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, [adminFetch, participantId, forumDay, onlySelectedDay]);

  return (
    <div className="adm-dash-stack">
      <SectionLabel>День из жизни</SectionLabel>
      <div className="adm-forum-toolbar" style={{ marginBottom: 8 }}>
        <label className="adm-insights-filter" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={onlySelectedDay}
            onChange={e => setOnlySelectedDay(e.target.checked)}
          />
          Только выбранный день фильтра ({formatForumDay(Number(forumDay) || 1)})
        </label>
      </div>
      {loading && days.length === 0 && (
        <DashCard title="Лента"><p className="adm-muted" style={{ margin: 0 }}>Загрузка…</p></DashCard>
      )}
      {!loading && days.every(d => d.count === 0) && (
        <DashCard title="Лента">
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>У участника пока нет ответов в точках дня.</p>
        </DashCard>
      )}
      {days.filter(d => d.count > 0).map(bucket => (
        <DashCard key={bucket.day} title={`${formatForumDay(bucket.day)} · ${bucket.count} событий`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bucket.items.map((item, idx) => (
              <div
                key={`${bucket.day}-${idx}`}
                style={{
                  borderLeft: '3px solid var(--m-accent, #2F6FED)',
                  paddingLeft: 12,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{itemTitle(item)}</div>
                {item.kind === 'state_check' && (
                  <>
                    <div className="adm-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      {[
                        item.emotionZone ? formatZoneName(item.emotionZone) : null,
                        item.emotion ? formatEmotionName(item.emotion) : null,
                        item.energy != null ? `энергия ${item.energy}/10` : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </div>
                    {item.answer ? (
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.answer}</div>
                    ) : null}
                  </>
                )}
                {item.kind === 'after_blocks' && (
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.answer || '—'}</div>
                )}
                {item.kind === 'evening' && (
                  <div style={{ fontSize: 12 }}>
                    Источник: {item.source} · оценок: {dashVal(Object.keys(item.ratings || {}).length)}
                    <pre style={{ margin: '6px 0 0', fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
                      {JSON.stringify(item.ratings, null, 2)}
                    </pre>
                  </div>
                )}
                {item.kind === 'piggybank' && (
                  <>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.text}</div>
                    <div className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {(item.tags || []).join(', ') || 'без тегов'}
                      {item.source ? ` · ${item.source}` : ''}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </DashCard>
      ))}
    </div>
  );
}

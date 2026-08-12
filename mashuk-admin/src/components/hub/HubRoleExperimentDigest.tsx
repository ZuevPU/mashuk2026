import { useEffect, useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, SectionLabel } from '../analytics/dashboardUi';
import { formatForumDay } from '../analytics/chartRu';
import {
  hubDisplayDay,
  hubFilterParams,
  isAllForumDay,
} from './hubQuery';
import {
  buildRoleExperimentDigest,
  type DayResultsSlice,
  type RoleExperimentDigest,
} from './hubNarrative/roleExperimentDigest';

type DayResultsPayload = DayResultsSlice & {
  experiment?: DayResultsSlice['experiment'];
  roles?: DayResultsSlice['roles'];
  fixation?: DayResultsSlice['fixation'];
  fixationQuotes?: DayResultsSlice['fixationQuotes'];
  openQuotes?: DayResultsSlice['openQuotes'];
};

function asSlice(raw: DayResultsPayload | null | undefined): DayResultsSlice | null {
  if (!raw?.meta) return null;
  return {
    meta: {
      day: Number(raw.meta.day) || 1,
      total: Number(raw.meta.total) || 0,
      submitted: Number(raw.meta.submitted) || 0,
      transferIndex: raw.meta.transferIndex ?? null,
      formalPct: raw.meta.formalPct ?? null,
    },
    experiment: raw.experiment ?? [],
    roles: raw.roles ?? [],
    fixation: raw.fixation ?? [],
    fixationQuotes: raw.fixationQuotes ?? [],
    openQuotes: raw.openQuotes ?? [],
  };
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ minWidth: 88 }}>
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        color: '#E07A3D',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}
      >
        {value}
      </div>
      <div className="adm-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function DigestBody({ digest }: { digest: RoleExperimentDigest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
        Сегодня анкету заполнили{' '}
        <strong>{digest.submitted}</strong>
        {digest.cohort ? ` из ${digest.cohort}` : ''}
        {' '}участников
        {digest.fillPct ? ` (${digest.fillPct}%)` : ''}.
      </p>

      <section>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, letterSpacing: 0.02 }}>
          Насколько эксперимент состоялся
        </h4>
        {digest.buckets.total === 0 ? (
          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>
            По исходам ролевого эксперимента данных пока недостаточно.
          </p>
        ) : (
          <>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 10,
              paddingBottom: 10,
              borderBottom: '1px solid #e8e4de',
            }}
            >
              <Metric value={`${digest.share.succeeded}%`} label="попробовали роль" />
              <Metric value={`${digest.share.natural}%`} label="естественно" />
              <Metric value={`${digest.share.unusual}%`} label="непривычно, но получилось" />
              <Metric value={`${digest.share.unclear}%`} label="пока не оценить" />
              <Metric value={`${digest.share.failed}%`} label="не состоялся" />
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--m-text-secondary)' }}>
              У {digest.share.failed}% участников эксперимент не состоялся или остался незавершённым.
              {digest.vsPrevTransfer
                ? ` Это ${digest.vsPrevTransfer} результату предыдущего дня${digest.prevTransfer != null ? ` (${digest.prevTransfer}%)` : ''}.`
                : ''}
            </p>
          </>
        )}
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Как участники воспринимают опыт</h4>
        {digest.perception.top ? (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            Чаще всего роль воспринимали как <strong>{digest.perception.top}</strong>
            {' '}({digest.perception.topPct}%)
            {digest.perception.second
              ? <> · на втором месте — <strong>{digest.perception.second}</strong> ({digest.perception.secondPct}%)</>
              : null}
            . Эксперимент преимущественно читается как {digest.perception.reading}.
          </p>
        ) : (
          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>Оценок восприятия пока мало.</p>
        )}
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Выбор на завтра</h4>
        {digest.tomorrow.top ? (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            Самая востребованная роль — <strong>«{digest.tomorrow.top}»</strong>
            {' '}({digest.tomorrow.n} · {digest.tomorrow.pct}%).
            {digest.tomorrow.delta ? ` Интерес к ней ${digest.tomorrow.delta}.` : ''}
            {digest.tomorrow.second && digest.tomorrow.secondDelta
              ? ` Также заметно ${digest.tomorrow.secondDelta} выбор «${digest.tomorrow.second}».`
              : ''}
          </p>
        ) : (
          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>Выбор роли на завтра ещё не проявился.</p>
        )}
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Что фиксируют для себя</h4>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          {digest.fixation.theme1
            ? <>Темы: <strong>{digest.fixation.theme1}</strong>
              {digest.fixation.theme2 ? <> и <strong>{digest.fixation.theme2}</strong></> : null}. </>
            : null}
          Участники отмечают, что {digest.fixation.summary}.
        </p>
        {digest.fixation.quote && (
          <blockquote style={{
            margin: '10px 0 0',
            padding: '10px 14px',
            borderLeft: '3px solid #e6ae4a',
            background: 'rgba(230, 174, 74, 0.08)',
            fontSize: 13.5,
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
          >
            «{digest.fixation.quote}»
          </blockquote>
        )}
      </section>

      <section style={{
        marginTop: 4,
        padding: '14px 16px',
        borderRadius: 10,
        background: 'rgba(224, 122, 61, 0.06)',
        border: '1px solid rgba(224, 122, 61, 0.18)',
      }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: '#C05621', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.04 }}>
          Итог дня
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          Сегодняшний эксперимент скорее <strong>{digest.verdict.status}</strong>.
          {' '}Главный сигнал — {digest.verdict.signal}.
          {' '}Выбор на завтра показывает {digest.verdict.tomorrowSignal}.
        </p>
      </section>
    </div>
  );
}

/**
 * Ежедневный смысловой комментарий по ролевому эксперименту
 * для утреннего штаба / текста бота — в конце блока ролей на линзе «Форум».
 */
export function HubRoleExperimentDigest() {
  const {
    adminFetch, forumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [today, setToday] = useState<DayResultsSlice | null>(null);
  const [prev, setPrev] = useState<DayResultsSlice | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const allForum = isAllForumDay(forumDay);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    const load = async () => {
      try {
        const dayParams = hubFilterParams({
          mode: 'day',
          forumDay: allForum ? String(selectedDay) : forumDay,
          direction,
          group,
          ageCategory,
          activity,
        });
        // Для комментария нужен конкретный день (при «весь форум» — текущий)
        if (allForum) {
          dayParams.set('mode', 'day');
          dayParams.set('day', String(selectedDay));
        }

        const todayRes = await adminFetch(`/analytics/hub/day-results?${dayParams}`) as DayResultsPayload;
        if (cancelled) return;
        setToday(asSlice(todayRes));

        if (selectedDay > 1) {
          const prevParams = hubFilterParams({
            mode: 'day',
            forumDay: String(selectedDay - 1),
            direction,
            group,
            ageCategory,
            activity,
          });
          const prevRes = await adminFetch(`/analytics/hub/day-results?${prevParams}`) as DayResultsPayload;
          if (cancelled) return;
          setPrev(asSlice(prevRes));
        } else {
          setPrev(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Не удалось собрать комментарий');
          setToday(null);
          setPrev(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [adminFetch, forumDay, selectedDay, allForum, direction, group, ageCategory, activity]);

  const digest = useMemo(() => {
    if (!today) return null;
    return buildRoleExperimentDigest(today, prev);
  }, [today, prev]);

  const copyMarkdown = async () => {
    if (!digest?.markdown) return;
    try {
      await navigator.clipboard.writeText(digest.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowRaw(true);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <SectionLabel>Комментарий дня · ролевой эксперимент</SectionLabel>
      <DashCard
        title={`Ежедневный комментарий · ${formatForumDay(selectedDay)}`}
      >
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.45 }}>
          Смысловой разбор для утреннего штаба и текста бота: исходы эксперимента, восприятие роли,
          выбор на завтра и то, что участники фиксируют о себе.
          {allForum ? ' Показан текущий день форума (в фильтре выбран весь форум).' : ''}
        </p>

        {loading && <p className="adm-muted" style={{ margin: 0 }}>Собираем данные вечерней анкеты…</p>}
        {err && !loading && (
          <p style={{ margin: 0, color: '#9B2C2C', fontSize: 13 }}>{err}</p>
        )}
        {!loading && !err && digest && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => void copyMarkdown()}>
                {copied ? 'Скопировано' : 'Скопировать для бота'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() => setShowRaw(v => !v)}
              >
                {showRaw ? 'Скрыть текст' : 'Показать текст'}
              </button>
            </div>
            <DigestBody digest={digest} />
            {showRaw && (
              <pre style={{
                marginTop: 16,
                padding: 12,
                background: '#f7f5f0',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                maxHeight: 420,
                overflow: 'auto',
              }}
              >
                {digest.markdown}
              </pre>
            )}
          </>
        )}
        {!loading && !err && !digest && (
          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>
            Нет данных итоговой анкеты за {formatForumDay(selectedDay)}.
          </p>
        )}
      </DashCard>
    </div>
  );
}

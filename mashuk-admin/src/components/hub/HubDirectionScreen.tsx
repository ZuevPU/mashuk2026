import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import {
  DashCard,
  DashGrid,
  DashKpi,
  DashScreenTitle,
  QuoteList,
  SectionLabel,
  SrcBars,
  TagPills,
  ZoneBars,
  dashVal,
} from '../analytics/dashboardUi';
import { DayComparisonPanel, DIRECTION_DAY_METRICS } from '../analytics/DayComparisonPanel';
import { TouchpointCoveragePanel } from '../analytics/TouchpointCoveragePanel';
import { formatEmotionName, formatForumDay, formatZoneName } from '../analytics/chartRu';
import { roleName } from '../onboarding/roleOptions';
import { adminDownloadBinary } from '../../admin/client';
import { LeaderboardTable } from '../rating/LeaderboardTable';
import { DEFAULT_LEADERBOARD_FILTERS, type LeaderboardRow } from '../rating/leaderboardTypes';
import { HubKpiRow } from './HubKpiRow';
import { WordDrilldown } from './WordDrilldown';
import { downloadAllHubExports, downloadHubExport, directionExportItems } from './hubExports';
import { PracticeRecommendNpsTable } from '../analytics/PracticeRecommendNpsTable';
import { hubFilterParams, statePhaseOf, topWordTokens } from './hubQuery';

type KindAnswer = {
  participantId: number;
  name: string;
  group: string;
  answer: string;
  emotion: string | null;
  emotionZone: string | null;
  energy: number | null;
  timePoint: string | null;
  eventTitle: string | null;
  parentEventTitle: string | null;
};

type KindQuestion = {
  key: string;
  label: string;
  day: number | null;
  answered: number;
  uniqueParticipants: number;
  distribution: { label: string; count: number; pct: number }[];
  answers: KindAnswer[];
};

type MissingPerson = { participantId: number; name: string; group: string };

/** «блок → подтема» из полей ответа «После блоков» (та же логика, что в старом DirectionView). */
function afterBlocksPath(a: KindAnswer): string {
  const parent = (a.parentEventTitle || '').trim();
  const topic = (a.eventTitle || '').trim();
  if (parent && topic && parent !== topic) return `${parent} → ${topic}`;
  return topic || parent || '—';
}

function MissingPeopleCard({
  title,
  people,
  onOpenCard,
}: {
  title: string;
  people: MissingPerson[];
  onOpenCard: (id: number) => void;
}) {
  return (
    <DashCard title={`${title} · ${people.length}`}>
      {people.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Все зарегистрированные в срезе заполнили.</p>
      ) : (
        <div style={{ maxHeight: 220, overflow: 'auto' }}>
          <table className="adm-table">
            <thead><tr><th>Участник</th><th>Группа</th></tr></thead>
            <tbody>
              {people.map(p => (
                <tr key={p.participantId}>
                  <td>
                    <button type="button" className="adm-link" onClick={() => onOpenCard(p.participantId)}>
                      {p.name}
                    </button>
                  </td>
                  <td>{p.group || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}

/**
 * Линза «Направление» — не требует нового бэкенда: полный пакет уже собирает
 * существующий GET /analytics/dashboards/direction (см. buildDirectionDashboard).
 * Эта вкладка только по-новому организует тот же ответ — каждый блок один раз,
 * с понятными заголовками, без дублей старого DirectionView.
 */
export function HubDirectionScreen({ onOpenCard }: { onOpenCard: (id: number) => void }) {
  const {
    adminFetch, direction, setDirection, group, setGroup, forumDay, meta, ageCategory, activity,
  } = useInsights();
  const directionOptions = meta?.filters?.directions ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [touchpointThreshold, setTouchpointThreshold] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [vRabota, setVRabota] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!direction) {
      setData(null);
      setTouchpointThreshold(null);
      setVRabota(null);
      return;
    }
    setLoading(true);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction,
      group,
      ageCategory,
      activity,
    });
    const qs = params.toString();
    Promise.all([
      adminFetch(`/analytics/dashboards/direction?${qs}`),
      adminFetch(`/analytics/dashboards/pulse?${qs}`).catch(() => null),
      adminFetch(`/analytics/dashboards/piggybank?${qs}`).catch(() => null),
    ])
      .then(([dirRes, pulseRes, piggyRes]) => {
        setData(dirRes);
        const pulse = pulseRes as { activity?: { touchpointThreshold?: unknown } } | null;
        setTouchpointThreshold(pulse?.activity?.touchpointThreshold ?? null);
        const piggy = piggyRes as { vRabota?: unknown } | null;
        setVRabota(piggy?.vRabota ?? null);
      })
      .catch(() => {
        setData(null);
        setTouchpointThreshold(null);
        setVRabota(null);
      })
      .finally(() => setLoading(false));
  }, [adminFetch, direction, group, forumDay, ageCategory, activity]);

  if (!direction) {
    return (
      <div className="adm-dash-stack">
        <DashScreenTitle
          title="Направление"
          hint="Полный разбор одного направления: состояние, эмоции, анкеты, копилка, портрет и кто ещё не ответил."
        />
        <DashCard title="Выберите направление">
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
            <label className="adm-insights-filter">
              Направление
              <select
                className="adm-input"
                value={direction}
                onChange={e => { setDirection(e.target.value); setGroup(''); }}
              >
                <option value="">Выберите…</option>
                {directionOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>
        </DashCard>
      </div>
    );
  }

  if (loading && !data) {
    return <DashCard title={direction}><p className="adm-muted" style={{ margin: 0 }}>Загрузка…</p></DashCard>;
  }
  if (!data || data.requiresDirection) {
    return <DashCard title={direction}><p className="adm-muted" style={{ margin: 0 }}>Нет данных для этого среза.</p></DashCard>;
  }

  const kpi = data.kpi ?? {};
  const pulse = data.stateCheck?.emotionalPulse ?? {};
  const groupsAvailable: string[] = data.groupsAvailable?.length ? data.groupsAvailable : (meta?.filters?.groups ?? []);
  const notes: string[] = data.diagnostics?.notes ?? [];
  const byGroup = (data.ops?.byGroup ?? []) as {
    group: string; registered: number; evening: number; afterBlocks: number; stateCheck: number;
    eveningFillPct: number; afterBlocksFillPct: number; stateCheckFillPct: number;
  }[];
  const eveningQuestions = (data.evening?.questions ?? []) as KindQuestion[];
  const afterQuestions = (data.afterBlocks?.questions ?? []) as KindQuestion[];
  const stateQuestions = (data.stateCheck?.questions ?? []) as KindQuestion[];
  const byEvent = (data.afterBlocks?.byEvent ?? []) as { label: string; count: number; pct: number }[];
  const ratingTop = (data.activity?.ratingTop ?? []) as { rank?: number; id: number; name: string; points?: number }[];
  const leaderboardRows: LeaderboardRow[] = ratingTop.map((r, idx) => {
    const parts = String(r.name || '').trim().split(/\s+/);
    return {
      rank: r.rank ?? idx + 1,
      id: r.id,
      firstName: parts[0] || null,
      lastName: parts.slice(1).join(' ') || null,
      direction,
      score: r.points ?? 0,
    };
  });
  const eveningAnswers = eveningQuestions.flatMap(q => q.answers.map(a => ({
    participantId: a.participantId,
    name: a.name,
    group: a.group,
    answer: a.answer || '',
  }))).filter(a => a.answer.trim().length > 2 && !/^\d+(\.\d+)?$/.test(a.answer.trim()));
  const textAnswers = [
    ...eveningAnswers,
    ...afterQuestions.flatMap(q => q.answers.map(a => ({
      participantId: a.participantId,
      name: a.name,
      group: a.group,
      answer: a.answer || '',
    }))),
  ].filter(a => a.answer.trim().length > 0);
  const themeTokens = (data.portrait?.themeTokens ?? []) as { token: string; count: number }[];
  const eveningTokens = topWordTokens(eveningAnswers.map(a => a.answer), 20);
  const piggyTop = (data.piggybank?.topParticipants ?? []) as {
    participantId: number; name: string; count: number;
  }[];
  const exportItems = directionExportItems(String(forumDay || 1), direction, group || undefined);
  const vRabotaSample = (vRabota?.sample ?? []) as { id: number; text: string; source?: string }[];
  const vRabotaTotal = Number(vRabota?.total ?? 0);

  const stateAnswers = stateQuestions.flatMap(q => q.answers);
  const phaseEmotionBars = (() => {
    const phases = ['morning', 'day', 'evening'] as const;
    const result: Record<(typeof phases)[number], { label: string; count: number }[]> = {
      morning: [], day: [], evening: [],
    };
    for (const phase of phases) {
      const counts = new Map<string, number>();
      for (const a of stateAnswers) {
        if (statePhaseOf(a.timePoint) !== phase) continue;
        const label = a.emotion ? formatEmotionName(a.emotion) : null;
        if (!label) continue;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      result[phase] = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
    }
    return result;
  })();
  const phaseReasonTokens = (() => {
    const phases = ['morning', 'day', 'evening'] as const;
    const result: Record<(typeof phases)[number], { token: string; count: number }[]> = {
      morning: [], day: [], evening: [],
    };
    for (const phase of phases) {
      const texts = stateAnswers
        .filter(a => statePhaseOf(a.timePoint) === phase && (a.answer || '').trim())
        .map(a => a.answer);
      result[phase] = topWordTokens(texts, 12);
    }
    return result;
  })();

  const download = (path: string, file: string) => { void adminDownloadBinary(path, file); };

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title={direction}
        hint={`${data.header?.dayLabel || `D${forumDay}`}${data.header?.calendarDate ? ` · ${data.header.calendarDate}` : ''}${group ? ` · группа ${group}` : ''}`}
      />

      <DashCard title="Срез направления">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, marginTop: 0 }}>
          <label className="adm-insights-filter">
            Направление
            <select
              className="adm-input"
              value={direction}
              onChange={e => { setDirection(e.target.value); setGroup(''); }}
            >
              {directionOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="adm-insights-filter">
            Группа
            <select className="adm-input" value={group} onChange={e => setGroup(e.target.value)}>
              <option value="">Все группы направления</option>
              {groupsAvailable.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        </div>
      </DashCard>

      <HubKpiRow
        items={[
          { value: dashVal(kpi.registered), label: 'зарегистрировано', sub: 'в направлении', accent: 'var(--m-accent)' },
          {
            value: kpi.touchpointCoveragePct != null ? `${kpi.touchpointCoveragePct}%` : '—',
            label: 'охват активности форум',
            sub: data.forumCompare?.activityRatePct != null ? `форум ${data.forumCompare.activityRatePct}%` : undefined,
            accent: '#22c55e',
          },
          { value: dashVal(kpi.activeToday), label: 'активны в срезе' },
          { value: dashVal(kpi.avgEnergy), label: 'средняя энергия', sub: 'проверка состояния', accent: '#f59e0b' },
          {
            value: kpi.riskFatiguePct != null ? `${kpi.riskFatiguePct}%` : '—',
            label: 'риск + усталость',
            accent: '#ef4444',
          },
          {
            value: `${dashVal(kpi.eveningSubmitted)} / ${dashVal(kpi.afterBlocksSubmitted)}`,
            label: 'итоги дня / после блоков',
            sub: `охват ${kpi.eveningFillPct ?? '—'}% · ${kpi.afterBlocksFillPct ?? '—'}%`,
          },
        ]}
      />

      <DayComparisonPanel
        title="Динамика по дням · направление"
        hint="Показатели этого направления по дням форума."
        series={data.daySeries ?? kpi.daySeries}
        metrics={DIRECTION_DAY_METRICS}
        hideDirectionTab
      />

      {notes.length > 0 && (
        <DashCard title="Примечания">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {notes.map((n: string) => <li key={n}>{n}</li>)}
          </ul>
        </DashCard>
      )}

      <SectionLabel>Эмоции и энергия · направление</SectionLabel>
      <DashGrid cols={3}>
        <DashKpi value={dashVal(pulse.phaseCounts?.morning)} label="ответов · утро" />
        <DashKpi value={dashVal(pulse.phaseCounts?.day)} label="ответов · день" />
        <DashKpi value={dashVal(pulse.phaseCounts?.evening)} label="ответов · вечер" />
      </DashGrid>
      <ZoneBars title="Зоны эмоций · направление" zones={pulse.zonesPercent} />
      <DashGrid cols={3}>
        <ZoneBars title="Зоны · утро" zones={pulse.byPhase?.morning} />
        <ZoneBars title="Зоны · день" zones={pulse.byPhase?.day} />
        <ZoneBars title="Зоны · вечер" zones={pulse.byPhase?.evening} />
      </DashGrid>
      {(pulse.emotions ?? []).length > 0 && (
        <DashCard title="11 эмоций · направление">
          <SrcBars items={(pulse.emotions as { label: string; count: number; pct: number }[]).map(d => ({
            label: `${d.label} (${d.pct}%) · ${d.count}`,
            count: d.count,
          }))} />
        </DashCard>
      )}
      <DashGrid cols={3}>
        <DashCard title="11 эмоций · утро">
          {phaseEmotionBars.morning.length
            ? <SrcBars items={phaseEmotionBars.morning} />
            : <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>}
        </DashCard>
        <DashCard title="11 эмоций · день">
          {phaseEmotionBars.day.length
            ? <SrcBars items={phaseEmotionBars.day} />
            : <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>}
        </DashCard>
        <DashCard title="11 эмоций · вечер">
          {phaseEmotionBars.evening.length
            ? <SrcBars items={phaseEmotionBars.evening} />
            : <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>}
        </DashCard>
      </DashGrid>
      <DashGrid cols={3}>
        <DashCard title="Причины · утро">
          {phaseReasonTokens.morning.length
            ? <TagPills items={phaseReasonTokens.morning.map(t => ({ label: `${t.token} · ${t.count}` }))} />
            : <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>}
        </DashCard>
        <DashCard title="Причины · день">
          {phaseReasonTokens.day.length
            ? <TagPills items={phaseReasonTokens.day.map(t => ({ label: `${t.token} · ${t.count}` }))} />
            : <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>}
        </DashCard>
        <DashCard title="Причины · вечер">
          {phaseReasonTokens.evening.length
            ? <TagPills items={phaseReasonTokens.evening.map(t => ({ label: `${t.token} · ${t.count}` }))} />
            : <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>}
        </DashCard>
      </DashGrid>
      {stateQuestions.map(q => (
        <DashCard key={`sc-${q.key}`} title={`Состояние · ${q.label}`}>
          <div className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Ответов: {q.answered} · участников: {q.uniqueParticipants}
          </div>
          {q.distribution.length > 0 && (
            <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
          )}
          <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
            <table className="adm-table">
              <thead>
                <tr><th>Участник</th><th>Группа</th><th>Фаза</th><th>Зона</th><th>Энергия</th><th>Причина</th></tr>
              </thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`${q.key}-${a.participantId}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                        {a.name || `#${a.participantId}`}
                      </button>
                    </td>
                    <td>{a.group || '—'}</td>
                    <td>{a.timePoint || '—'}</td>
                    <td>
                      {[a.emotionZone ? formatZoneName(a.emotionZone) : null, a.emotion ? formatEmotionName(a.emotion) : null]
                        .filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>{a.energy ?? '—'}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{a.answer || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}

      <SectionLabel>Точки дня · охват</SectionLabel>
      <DashGrid cols={3}>
        <DashKpi value={kpi.eveningFillPct != null ? `${kpi.eveningFillPct}%` : '—'} label="охват итоговой анкеты" />
        <DashKpi value={kpi.afterBlocksFillPct != null ? `${kpi.afterBlocksFillPct}%` : '—'} label="охват после блоков" />
        <DashKpi value={kpi.stateCheckFillPct != null ? `${kpi.stateCheckFillPct}%` : '—'} label="охват проверки состояния" />
      </DashGrid>
      <TouchpointCoveragePanel data={touchpointThreshold} />
      {byEvent.length > 0 && (
        <DashCard title="После блоков · по блокам программы">
          <SrcBars items={byEvent.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
        </DashCard>
      )}

      <SectionLabel>Итоговая анкета · направление</SectionLabel>
      <PracticeRecommendNpsTable
        data={data.evening?.practiceRecommendNps}
        title="Готов ли рекомендовать эту практику коллегам?"
      />
      {eveningQuestions.length === 0 ? (
        <DashCard title="Итоговая анкета"><p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет ответов в срезе.</p></DashCard>
      ) : eveningQuestions.map(q => (
        <DashCard key={`ev-${q.key}`} title={q.label}>
          {q.distribution.length > 0 && (
            <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
          )}
          <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
            <table className="adm-table">
              <thead><tr><th>Участник</th><th>Группа</th><th>Ответ</th></tr></thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`ev-${q.key}-${a.participantId}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>{a.name}</button>
                    </td>
                    <td>{a.group || '—'}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>
                      {a.answer != null && a.answer !== '' ? String(a.answer) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}

      <SectionLabel>После блоков · направление</SectionLabel>
      {afterQuestions.length === 0 ? (
        <DashCard title="После блоков"><p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет ответов в срезе.</p></DashCard>
      ) : afterQuestions.map(q => (
        <DashCard key={`ab-${q.key}`} title={`${q.label}${q.day != null ? ` · ${formatForumDay(q.day)}` : ''}`}>
          {q.distribution.length > 0 && (
            <SrcBars items={q.distribution.map(d => ({ label: `${d.label} (${d.pct}%)`, count: d.count }))} />
          )}
          <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
            <table className="adm-table">
              <thead><tr><th>Участник</th><th>Группа</th><th>Событие / подтема</th><th>Ответ</th></tr></thead>
              <tbody>
                {q.answers.map((a, idx) => (
                  <tr key={`ab-${q.key}-${a.participantId}-${idx}`}>
                    <td>
                      <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>{a.name}</button>
                    </td>
                    <td>{a.group || '—'}</td>
                    <td>{afterBlocksPath(a)}</td>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{a.answer || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ))}

      <SectionLabel>Программа</SectionLabel>
      {(data.program?.directionRatings ?? []).length > 0 && (
        <DashCard title="Оценка программы направления">
          <SrcBars items={(data.program.directionRatings as { label: string; avg?: number; responses?: number }[]).map(r => ({
            label: `${r.label}${r.avg != null ? ` · ср. ${r.avg}` : ''}`,
            count: r.responses ?? 0,
          }))} />
        </DashCard>
      )}
      {(data.program?.topMentions ?? []).length > 0 && (
        <DashCard title="Упоминания">
          <TagPills items={(data.program.topMentions as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
            tone: 'accent' as const,
          }))} />
        </DashCard>
      )}

      <SectionLabel>Слова в ответах · клик для списка</SectionLabel>
      {eveningTokens.length > 0 && (
        <WordDrilldown
          title="Итоговая анкета · слова в текстовых ответах"
          tokens={eveningTokens}
          answers={eveningAnswers}
          onOpenCard={onOpenCard}
        />
      )}
      {themeTokens.length > 0 && (
        <WordDrilldown
          title="Темы ответов направления (анкета + после блоков)"
          tokens={themeTokens}
          answers={textAnswers}
          onOpenCard={onOpenCard}
        />
      )}

      <SectionLabel>Рейтинг, копилка, роли, портрет</SectionLabel>
      {leaderboardRows.length > 0 && (
        <DashCard title="Рейтинг направления">
          <LeaderboardTable
            rows={leaderboardRows}
            filters={{
              ...DEFAULT_LEADERBOARD_FILTERS,
              scope: 'shift',
              track: 'total',
              direction,
            }}
            maxRows={15}
            onOpenCard={onOpenCard}
          />
        </DashCard>
      )}
      <DashGrid cols={2}>
        {(data.portrait?.roleDistribution ?? []).length > 0 && (
          <DashCard title="Роль × направление">
            <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
              «Роль» — независимый от направления атрибут участника (диагностика при регистрации); здесь — её разрез внутри этого направления.
            </p>
            <SrcBars items={(data.portrait.roleDistribution as { key: string; count: number }[]).map(r => ({
              label: roleName(r.key) || r.key,
              count: r.count,
            }))} />
          </DashCard>
        )}
        {(data.piggybank?.topThemes ?? []).length > 0 && (
          <DashCard title="Копилка направления · темы">
            <TagPills items={(data.piggybank.topThemes as { token: string; count: number }[]).map(t => ({
              label: `${t.token} · ${t.count}`,
            }))} />
          </DashCard>
        )}
      </DashGrid>
      {piggyTop.length > 0 && (
        <DashCard title="Копилка · топ участников">
          <table className="adm-table">
            <thead><tr><th>Участник</th><th>Записей</th></tr></thead>
            <tbody>
              {piggyTop.map(r => (
                <tr key={r.participantId}>
                  <td>
                    <button type="button" className="adm-link" onClick={() => onOpenCard(r.participantId)}>
                      {r.name}
                    </button>
                  </td>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}
      <DashCard title={`Копилка · в работу · ${vRabotaTotal}`}>
        {vRabotaSample.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет записей с тегом «в работу».</p>
        ) : (
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            <table className="adm-table">
              <thead><tr><th>Текст</th><th>Источник</th></tr></thead>
              <tbody>
                {vRabotaSample.map(row => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>{row.text}</td>
                    <td>{row.source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
      {(data.portrait?.goalTopTokens ?? []).length > 0 && (
        <DashCard title="Точка А · частые слова">
          <TagPills items={(data.portrait.goalTopTokens as { token: string; count: number }[]).map(t => ({
            label: `${t.token} · ${t.count}`,
            tone: 'accent' as const,
          }))} />
        </DashCard>
      )}
      {(data.portrait?.quotes ?? []).length > 0 && (
        <DashCard title="Цитаты">
          <QuoteList items={data.portrait.quotes as { text: string }[]} />
        </DashCard>
      )}
      {data.portrait?.departure && (
        <DashCard title="Заезд → выезд · направление">
          <p className="adm-muted" style={{ fontSize: 13, marginTop: 0 }}>
            Обе точки: {data.portrait.departure.bothPoints ?? 0} / {data.portrait.departure.total ?? 0}
          </p>
          <div style={{ fontSize: 12 }}>
            А: {(data.portrait.departure.pointATokens ?? []).map((t: { token: string }) => t.token).join(', ') || '—'}
          </div>
          <div style={{ fontSize: 12 }}>
            Б: {(data.portrait.departure.pointBTokens ?? []).map((t: { token: string }) => t.token).join(', ') || '—'}
          </div>
        </DashCard>
      )}

      <SectionLabel>Кто не ответил · двоечники и без активности</SectionLabel>
      <p className="adm-muted" style={{ fontSize: 12, margin: '-4px 0 0' }}>
        Списки ниже — по каждой форме отдельно. «Не сдали» = зарегистрированы в направлении, но не заполнили форму в срезе.
      </p>
      {byGroup.length > 0 && (
        <DashCard title="Охват по группам">
          <table className="adm-table">
            <thead><tr><th>Группа</th><th>Зарег.</th><th>Итоги дня</th><th>После блоков</th><th>Состояние</th></tr></thead>
            <tbody>
              {byGroup.map(g => (
                <tr key={g.group}>
                  <td>{g.group}</td>
                  <td>{g.registered}</td>
                  <td>{g.evening} · {g.eveningFillPct}%</td>
                  <td>{g.afterBlocks} · {g.afterBlocksFillPct}%</td>
                  <td>{g.stateCheck} · {g.stateCheckFillPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}
      <DashGrid cols={3}>
        <MissingPeopleCard title="Не сдали итоги дня" people={data.ops?.missingEvening ?? []} onOpenCard={onOpenCard} />
        <MissingPeopleCard title="Нет ответа после блоков" people={data.ops?.missingAfterBlocks ?? []} onOpenCard={onOpenCard} />
        <MissingPeopleCard title="Нет проверки состояния" people={data.ops?.missingStateCheck ?? []} onOpenCard={onOpenCard} />
      </DashGrid>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '16px 0 8px' }}>
        {exportItems.map(item => (
          <button
            key={item.id}
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => { void downloadHubExport(item); }}
          >
            Скачать · {item.label}
          </button>
        ))}
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          onClick={() => {
            if (data.exportPath) {
              download(data.exportPath, exportItems[0]?.filename ?? 'direction.xlsx');
            } else {
              void downloadAllHubExports(exportItems);
            }
          }}
        >
          Выгрузить всё по направлению
        </button>
      </div>
    </div>
  );
}

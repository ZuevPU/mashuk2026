import { DashCard } from '../analytics/dashboardUi';

export type RoleJourneyBucket = {
  key: string;
  label: string;
  count: number;
  pct: number;
};

export type RoleJourneyNow = {
  roleKey: string;
  name: string;
  short?: string;
  count: number;
  pct: number;
};

export type RoleJourney = {
  n: number;
  whatHappened?: RoleJourneyBucket[];
  now?: RoleJourneyNow[];
  nowN?: number;
  dominant?: { roleKey: string; name: string; short?: string; pct: number; count: number } | null;
  helped?: { label: string; pct: number; count: number }[];
  conclusion?: string;
};

function fmtPct(n: number): string {
  const rounded = Math.round(n);
  return Number.isInteger(n) || Math.abs(n - rounded) < 0.05
    ? String(rounded)
    : String(n).replace('.', ',');
}

/**
 * Макет штаба: что произошло с ролью / где сейчас / что чаще случается / вывод.
 */
export function HubRoleProgressBoard({
  journey,
  quote,
  scopeNote,
}: {
  journey: RoleJourney | null | undefined;
  quote?: { text: string; caption?: string } | null;
  scopeNote?: string;
}) {
  if (!journey || !journey.n) return null;

  const happened = journey.whatHappened ?? [];
  const now = journey.now ?? [];
  const helped = journey.helped ?? [];
  const leadPct = Math.max(0, ...happened.map(r => r.pct));
  const histMax = Math.max(1, ...now.map(r => r.pct));
  const modeKey = journey.dominant?.roleKey;
  const histH = 132;

  return (
    <DashCard title="Как участники проживают роли">
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 16 }}>
        {journey.n} чел.
        {scopeNote ? ` · ${scopeNote}` : ' · текущий срез форума'}
      </p>

      <div className="adm-role-board-grid">
        <div>
          <h4 className="adm-role-board-h">Что произошло с ролью</h4>
          <div className="adm-role-board-bars">
            {happened.map(row => (
              <div key={row.key} className="adm-role-board-hrow" title={`${row.count} чел.`}>
                <span className="adm-role-board-label">{row.label}</span>
                <div className="adm-role-board-track">
                  <div
                    className={`adm-role-board-fill${row.pct === leadPct && leadPct > 0 ? ' is-lead' : ''}`}
                    style={{ width: `${Math.min(100, row.pct)}%` }}
                  />
                </div>
                <span className="adm-role-board-pct">{fmtPct(row.pct)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="adm-role-board-hist-box">
          <h4 className="adm-role-board-h">Где участники находятся сейчас</h4>
          {journey.dominant ? (
            <div className="adm-role-board-avg-row">
              <span className="adm-role-board-avg">{fmtPct(journey.dominant.pct)}%</span>
              <span className="adm-muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                самая частая роль · {journey.dominant.name}
              </span>
            </div>
          ) : (
            <p className="adm-muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
              Текущая роль ещё не сложилась.
            </p>
          )}
          <div className="adm-role-board-hist" style={{ height: histH }}>
            {now.map(row => {
              const h = Math.max(row.pct > 0 ? 6 : 2, (row.pct / histMax) * (histH - 28));
              const on = row.roleKey === modeKey;
              return (
                <div key={row.roleKey} title={`${row.name}: ${row.count} · ${fmtPct(row.pct)}%`}>
                  <span className="adm-role-board-hist-n">{row.pct > 0 ? `${fmtPct(row.pct)}%` : ''}</span>
                  <div
                    className={`adm-role-board-hist-b${on ? ' is-lead' : ''}`}
                    style={{ height: h }}
                  />
                  <span className="adm-role-board-hist-x">{row.short || row.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="adm-role-board-h">Что происходит с ролью</h4>
          {helped.length ? (
            <div className="adm-role-board-tags">
              {helped.map(tag => (
                <span key={tag.label} className="adm-role-board-tag">
                  {tag.label}
                  {' '}
                  <strong>{fmtPct(tag.pct)}%</strong>
                </span>
              ))}
            </div>
          ) : (
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Пока нет устойчивых сдвигов.</p>
          )}
        </div>

        <div>
          <h4 className="adm-role-board-h">Как читается сдвиг</h4>
          {quote?.text ? (
            <blockquote className="adm-role-board-quote">
              {quote.text}
              {quote.caption ? (
                <span className="adm-role-board-quote-m">{quote.caption}</span>
              ) : null}
            </blockquote>
          ) : (
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
              Характерная формулировка появится, когда накопится сдвиг по дням.
            </p>
          )}
        </div>
      </div>

      {journey.conclusion ? (
        <div className="adm-role-board-foot">
          <div className="adm-role-board-foot-k">Главный вывод</div>
          <p className="adm-role-board-foot-v">{journey.conclusion}</p>
        </div>
      ) : null}
    </DashCard>
  );
}

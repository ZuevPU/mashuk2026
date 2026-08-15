import { useMemo, useState } from 'react';
import { DashCard } from '../analytics/dashboardUi';

export const STATE_ZONE_COLORS: Record<string, string> = {
  'Подъём': '#57bd9c',
  'Включение': '#79b8c9',
  'Нейтраль': '#6f7d95',
  'Усталость': '#e6ae4a',
  'Риск': '#e2685e',
};

export const STATE_QUOTE_ZONE_ORDER = ['Подъём', 'Включение', 'Нейтраль', 'Усталость', 'Риск'] as const;

export type StateQuoteItem = {
  text: string;
  meta: string;
  phase?: string;
  phaseKey?: 'morning' | 'day' | 'evening';
  zone?: string;
  zoneKey?: string | null;
  dir?: string;
  polarity?: 'pos' | 'neg' | 'neu';
};

type QuotePhase = 'all' | 'morning' | 'day' | 'evening';
type QuoteDayPart = 'morning' | 'day' | 'evening';

const ZONE_FROM_KEY: Record<string, string> = {
  lift: 'Подъём',
  engagement: 'Включение',
  neutral: 'Нейтраль',
  fatigue: 'Усталость',
  risk: 'Риск',
};

function quotePhaseKey(q: StateQuoteItem): QuoteDayPart | 'other' {
  if (q.phaseKey === 'morning' || q.phaseKey === 'day' || q.phaseKey === 'evening') return q.phaseKey;
  const src = `${q.phase || ''} ${q.meta || ''}`.toLowerCase();
  if (src.includes('вечер')) return 'evening';
  if (src.includes('утро')) return 'morning';
  if (src.includes('день')) return 'day';
  return 'other';
}

function quoteZoneLabel(q: StateQuoteItem): string {
  if (q.zone && q.zone !== '—') return q.zone;
  if (q.zoneKey && ZONE_FROM_KEY[q.zoneKey]) return ZONE_FROM_KEY[q.zoneKey];
  const fromMeta = (q.meta.split(' · ')[1] || '').trim();
  return fromMeta || '—';
}

function quoteTone(q: StateQuoteItem): 'pos' | 'neg' | 'neu' {
  if (q.polarity === 'pos' || q.polarity === 'neg' || q.polarity === 'neu') return q.polarity;
  const zone = quoteZoneLabel(q);
  if (zone === 'Риск' || zone === 'Усталость') return 'neg';
  if (zone === 'Подъём' || zone === 'Включение') return 'pos';
  return 'neu';
}

function quoteDir(q: StateQuoteItem): string {
  if (q.dir) return q.dir;
  const parts = q.meta.split(' · ');
  return (parts[2] || '').trim();
}

type Props = {
  quotes: StateQuoteItem[];
  quotesTotal?: number;
  hidePhaseFilter?: boolean;
};

export function StateQuotesBlock({ quotes, quotesTotal, hidePhaseFilter = false }: Props) {
  const [quoteLimit, setQuoteLimit] = useState(24);
  const [quotePhase, setQuotePhase] = useState<QuotePhase>('all');
  const [quoteZones, setQuoteZones] = useState<string[]>([]);
  const [quoteDirFilter, setQuoteDirFilter] = useState('');
  const [quoteSort, setQuoteSort] = useState<'neg' | 'pos'>('neg');

  const quoteDirs = useMemo(() => (
    [...new Set(quotes.map(quoteDir).filter(d => d && d !== '—'))].sort((a, b) => a.localeCompare(b, 'ru'))
  ), [quotes]);

  const filteredQuotes = useMemo(() => {
    const zoneSet = new Set(quoteZones);
    const list = quotes.filter(q => {
      if (!hidePhaseFilter && quotePhase !== 'all' && quotePhaseKey(q) !== quotePhase) return false;
      if (zoneSet.size > 0 && !zoneSet.has(quoteZoneLabel(q))) return false;
      if (quoteDirFilter && quoteDir(q) !== quoteDirFilter) return false;
      return true;
    });
    const rank = (q: StateQuoteItem) => {
      const t = quoteTone(q);
      if (quoteSort === 'neg') return t === 'neg' ? 0 : t === 'neu' ? 1 : 2;
      return t === 'pos' ? 0 : t === 'neu' ? 1 : 2;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [quotes, quotePhase, quoteZones, quoteDirFilter, quoteSort, hidePhaseFilter]);

  const quoteCounts = useMemo(() => {
    const phases = { morning: 0, day: 0, evening: 0 };
    const zones: Record<string, number> = {
      'Подъём': 0, 'Включение': 0, 'Нейтраль': 0, 'Усталость': 0, 'Риск': 0, '—': 0,
    };
    for (const q of quotes) {
      const p = quotePhaseKey(q);
      if (p === 'morning' || p === 'day' || p === 'evening') phases[p] += 1;
      const z = quoteZoneLabel(q);
      zones[z] = (zones[z] || 0) + 1;
    }
    return { phases, zones };
  }, [quotes]);

  const total = quotesTotal ?? quotes.length;

  return (
    <DashCard
      title={`Комментарии участников · ${filteredQuotes.length}${
        filteredQuotes.length !== total ? ` из ${total}` : ''
      }`}
      className="adm-hub-quotes-card"
    >
      <div className="adm-state-quote-filters">
        {!hidePhaseFilter && (
          <div className="adm-state-quote-filter-row">
            <span className="adm-state-quote-filter-label">Часть дня</span>
            <div className="adm-forum-seg" role="group" aria-label="Часть дня">
              {([
                ['all', 'Все'],
                ['morning', `Утро · ${quoteCounts.phases.morning}`],
                ['day', `День · ${quoteCounts.phases.day}`],
                ['evening', `Вечер · ${quoteCounts.phases.evening}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={quotePhase === key ? 'on' : ''}
                  onClick={() => setQuotePhase(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="adm-state-quote-filter-row">
          <span className="adm-state-quote-filter-label">Состояние</span>
          <div className="adm-forum-seg" role="group" aria-label="Вид состояния">
            <button
              type="button"
              className={quoteZones.length === 0 ? 'on' : ''}
              onClick={() => setQuoteZones([])}
            >
              Все
            </button>
            {STATE_QUOTE_ZONE_ORDER.map(zone => (
              <button
                key={zone}
                type="button"
                className={quoteZones.includes(zone) ? 'on' : ''}
                onClick={() => setQuoteZones(prev => (
                  prev.includes(zone) ? prev.filter(z => z !== zone) : [...prev, zone]
                ))}
              >
                <i
                  className="adm-state-quote-zone-dot"
                  style={{ background: STATE_ZONE_COLORS[zone] }}
                  aria-hidden
                />
                {zone} · {quoteCounts.zones[zone] || 0}
              </button>
            ))}
          </div>
        </div>
        <div className="adm-state-quote-filter-row">
          <span className="adm-state-quote-filter-label">Сортировка</span>
          <div className="adm-forum-seg" role="group" aria-label="Сортировка">
            <button
              type="button"
              className={quoteSort === 'neg' ? 'on' : ''}
              onClick={() => setQuoteSort('neg')}
            >
              Сначала минус
            </button>
            <button
              type="button"
              className={quoteSort === 'pos' ? 'on' : ''}
              onClick={() => setQuoteSort('pos')}
            >
              Сначала плюс
            </button>
          </div>
          <label className="adm-insights-filter">
            Направление
            <select
              className="adm-input"
              value={quoteDirFilter}
              onChange={e => setQuoteDirFilter(e.target.value)}
            >
              <option value="">Все направления</option>
              {quoteDirs.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {filteredQuotes.length === 0 ? (
        <p className="adm-muted">Нет комментариев по выбранным фильтрам.</p>
      ) : (
        <>
          {filteredQuotes.slice(0, quoteLimit).map((q, i) => {
            const zone = quoteZoneLabel(q);
            return (
              <div
                key={`${q.meta}-${i}`}
                className={`adm-state-quote is-${quoteTone(q)}`}
                style={{ borderLeftColor: STATE_ZONE_COLORS[zone] || '#6f7d95' }}
              >
                {q.text}
                <span className="adm-state-quote-m">{q.meta}</span>
              </div>
            );
          })}
          {filteredQuotes.length > quoteLimit && (
            <button
              type="button"
              className="adm-btn adm-btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => setQuoteLimit(n => Math.min(n + 24, filteredQuotes.length))}
            >
              Показать ещё ({filteredQuotes.length - quoteLimit})
            </button>
          )}
        </>
      )}
    </DashCard>
  );
}

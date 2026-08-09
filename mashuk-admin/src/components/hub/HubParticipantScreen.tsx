import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashGrid, DashKpi, DashScreenTitle, SectionLabel, dashVal } from '../analytics/dashboardUi';
import { adminDownloadBinary } from '../../admin/client';
import { ParticipantDayTimeline } from './ParticipantDayTimeline';

type Hit = { id: number; name: string; direction?: string; groupName?: string };

type ActivityItem = {
  at: string | Date | null;
  kind: string;
  title: string;
  detail?: string;
};

type CardData = {
  participant?: {
    id: number;
    firstName?: string;
    lastName?: string;
    direction?: string | null;
    groupName?: string | null;
    roleKey?: string | null;
    activity?: string | null;
  };
  pointsSummary?: { path?: number; experience?: number; bonus?: number; total?: number };
};

function displayName(p: CardData['participant'], fallbackId: number): string {
  if (!p) return `#${fallbackId}`;
  const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  return name || `#${fallbackId}`;
}

/**
 * Линза «Участник» v1 + посуточная лента (v2) на существующих /participants* и hub/participant-feed.
 */
export function HubParticipantScreen({ onOpenCard }: { onOpenCard: (id: number) => void }) {
  const { adminFetch } = useInsights();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [card, setCard] = useState<CardData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingCard, setLoadingCard] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      adminFetch(`/participants?q=${encodeURIComponent(query.trim())}&limit=12`)
        .then((r: unknown) => {
          const body = r as {
            participants?: {
              id: number;
              firstName?: string;
              lastName?: string;
              direction?: string;
              groupName?: string;
            }[];
          };
          setHits((body.participants || []).map(p => ({
            id: p.id,
            name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || `#${p.id}`,
            direction: p.direction,
            groupName: p.groupName,
          })));
        })
        .catch(() => setHits([]));
    }, 280);
    return () => clearTimeout(t);
  }, [query, adminFetch]);

  useEffect(() => {
    if (!selectedId) {
      setCard(null);
      setActivity([]);
      return;
    }
    setLoadingCard(true);
    Promise.all([
      adminFetch(`/participants/${selectedId}/card`),
      adminFetch(`/participants/${selectedId}/activity`),
    ])
      .then(([cardRes, actRes]) => {
        setCard(cardRes as CardData);
        const items = (actRes as { items?: ActivityItem[] }).items ?? [];
        setActivity(items);
      })
      .catch(() => {
        setCard(null);
        setActivity([]);
      })
      .finally(() => setLoadingCard(false));
  }, [selectedId, adminFetch]);

  const p = card?.participant;
  const pts = card?.pointsSummary;

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Участник"
        hint="Поиск, карточка, сырая лента активности и «день из жизни»."
      />

      <DashCard title="Поиск участника">
        <label className="adm-insights-filter" style={{ display: 'block', maxWidth: 420 }}>
          ФИО / VK / id
          <input
            className="adm-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Начните вводить имя…"
          />
        </label>
        {hits.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
            {hits.map(h => (
              <li key={h.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  className={selectedId === h.id ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-secondary adm-btn-sm'}
                  onClick={() => setSelectedId(h.id)}
                >
                  {h.name}
                  {h.direction ? ` · ${h.direction}` : ''}
                  {h.groupName ? ` · ${h.groupName}` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!selectedId && (
          <p className="adm-muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
            Выберите участника — обязателен для этой линзы.
          </p>
        )}
      </DashCard>

      {selectedId && loadingCard && !card && (
        <DashCard title="Карточка"><p className="adm-muted" style={{ margin: 0 }}>Загрузка…</p></DashCard>
      )}

      {selectedId && card && (
        <>
          <DashCard title={displayName(p, selectedId)}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {[p?.direction, p?.groupName, p?.activity].filter(Boolean).join(' · ') || '—'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => onOpenCard(selectedId)}>
                Открыть карточку →
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={() => {
                  void adminDownloadBinary(
                    `/exports/participants-archive?participantId=${selectedId}`,
                    `participant_${selectedId}_archive.zip`,
                  );
                }}
              >
                Скачать всё по участнику
              </button>
            </div>
          </DashCard>

          <DashGrid cols={4}>
            <DashKpi value={dashVal(pts?.total)} label="баллы всего" accent="var(--m-accent)" />
            <DashKpi value={dashVal(pts?.path)} label="путь" />
            <DashKpi value={dashVal(pts?.experience)} label="опыт" />
            <DashKpi value={dashVal(pts?.bonus)} label="бонус" />
          </DashGrid>

          <SectionLabel>Сырая лента активности</SectionLabel>
          <DashCard title={`События · ${activity.length}`}>
            {activity.length === 0 ? (
              <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет событий.</p>
            ) : (
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="adm-table">
                  <thead>
                    <tr><th>Когда</th><th>Тип</th><th>Событие</th><th>Детали</th></tr>
                  </thead>
                  <tbody>
                    {activity.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {item.at ? new Date(item.at).toLocaleString('ru-RU') : '—'}
                        </td>
                        <td>{item.kind}</td>
                        <td>{item.title}</td>
                        <td style={{ maxWidth: 280, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                          {item.detail?.slice(0, 200) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashCard>

          <ParticipantDayTimeline participantId={selectedId} />
        </>
      )}
    </div>
  );
}

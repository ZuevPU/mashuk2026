import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { Tab } from '../../tabs';
import { InsightsProvider } from '../insights/InsightsContext';
import { HubToolbar } from './HubToolbar';
import { HubForumScreen } from './HubForumScreen';
import type { HubLens } from './hubLenses';

export type { HubLens } from './hubLenses';

const HubActivityScreen = lazy(() => import('./HubActivityScreen').then(m => ({ default: m.HubActivityScreen })));
const HubAfterBlocksScreen = lazy(() => import('./HubAfterBlocksScreen').then(m => ({ default: m.HubAfterBlocksScreen })));
const HubDayResultsScreen = lazy(() => import('./HubDayResultsScreen').then(m => ({ default: m.HubDayResultsScreen })));
const HubDirectionScreen = lazy(() => import('./HubDirectionScreen').then(m => ({ default: m.HubDirectionScreen })));
const HubExchangeScreen = lazy(() => import('./HubExchangeScreen').then(m => ({ default: m.HubExchangeScreen })));
const HubGroupsScreen = lazy(() => import('./HubGroupsScreen').then(m => ({ default: m.HubGroupsScreen })));
const HubParticipantScreen = lazy(() => import('./HubParticipantScreen').then(m => ({ default: m.HubParticipantScreen })));
const HubPiggybankScreen = lazy(() => import('./HubPiggybankScreen').then(m => ({ default: m.HubPiggybankScreen })));
const HubStateScreen = lazy(() => import('./HubStateScreen').then(m => ({ default: m.HubStateScreen })));
const HubStatsScreen = lazy(() => import('./HubStatsScreen').then(m => ({ default: m.HubStatsScreen })));

/**
 * Единый дашборд «Штаб» — линзы (форум/направление/группы/участник) в одной вкладке,
 * вместо 14 разрозненных экранов старой вкладки «Дашборды». Аддитивно: ничего
 * в components/analytics или components/insights не меняет.
 */
export function HubTab({
  adminFetch,
  reloadKey,
  setTab,
  onOpenCard,
}: {
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  reloadKey: number;
  setTab: (t: Tab) => void;
  onOpenCard: (id: number) => void;
}) {
  return (
    <InsightsProvider
      adminFetch={adminFetch}
      setTab={setTab}
      reloadKey={reloadKey}
      activeSection="analytics"
    >
      <HubShell onOpenCard={onOpenCard} />
    </InsightsProvider>
  );
}

function LensFallback() {
  return (
    <div className="adm-dash-stack">
      <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>Загрузка линзы…</p>
    </div>
  );
}

function LazyLens({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LensFallback />}>{children}</Suspense>;
}

function HubShell({ onOpenCard }: { onOpenCard: (id: number) => void }) {
  const [lens, setLens] = useState<HubLens>('forum');
  return (
    <div className="adm-dash-stack">
      <HubToolbar lens={lens} onLensChange={setLens} />
      {lens === 'forum' && <HubForumScreen onLensChange={setLens} />}
      {lens === 'stats' && <LazyLens><HubStatsScreen onLensChange={setLens} /></LazyLens>}
      {lens === 'dayResults' && <LazyLens><HubDayResultsScreen /></LazyLens>}
      {lens === 'forumResults' && <LazyLens><HubDayResultsScreen source="forum" /></LazyLens>}
      {lens === 'state' && <LazyLens><HubStateScreen /></LazyLens>}
      {lens === 'activity' && <LazyLens><HubActivityScreen /></LazyLens>}
      {lens === 'piggybank' && <LazyLens><HubPiggybankScreen /></LazyLens>}
      {lens === 'afterBlocks' && <LazyLens><HubAfterBlocksScreen /></LazyLens>}
      {lens === 'exchange' && <LazyLens><HubExchangeScreen /></LazyLens>}
      {lens === 'direction' && <LazyLens><HubDirectionScreen /></LazyLens>}
      {lens === 'groups' && <LazyLens><HubGroupsScreen onLensChange={setLens} /></LazyLens>}
      {lens === 'participant' && <LazyLens><HubParticipantScreen onOpenCard={onOpenCard} /></LazyLens>}
    </div>
  );
}

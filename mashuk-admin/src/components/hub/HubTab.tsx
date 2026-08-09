import { useState } from 'react';
import type { Tab } from '../../tabs';
import { InsightsProvider } from '../insights/InsightsContext';
import { HubToolbar } from './HubToolbar';
import { HubDirectionScreen } from './HubDirectionScreen';
import { HubForumScreen } from './HubForumScreen';
import { HubParticipantScreen } from './HubParticipantScreen';

export type HubLens = 'forum' | 'direction' | 'participant';

/**
 * Единый дашборд «Штаб» — 3 линзы (форум/направление/участник) в одной вкладке,
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

function HubShell({ onOpenCard }: { onOpenCard: (id: number) => void }) {
  const [lens, setLens] = useState<HubLens>('forum');
  return (
    <div className="adm-dash-stack">
      <HubToolbar lens={lens} onLensChange={setLens} />
      {lens === 'forum' && <HubForumScreen onLensChange={setLens} />}
      {lens === 'direction' && <HubDirectionScreen onOpenCard={onOpenCard} />}
      {lens === 'participant' && <HubParticipantScreen onOpenCard={onOpenCard} />}
    </div>
  );
}

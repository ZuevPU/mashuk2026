import { useState } from 'react';
import type { Tab } from '../../tabs';
import { InsightsProvider } from '../insights/InsightsContext';
import { HubToolbar } from './HubToolbar';
import { HubActivityScreen } from './HubActivityScreen';
import { HubDayResultsScreen } from './HubDayResultsScreen';
import { HubDirectionScreen } from './HubDirectionScreen';
import { HubForumScreen } from './HubForumScreen';
import { HubGroupsScreen } from './HubGroupsScreen';
import { HubParticipantScreen } from './HubParticipantScreen';
import { HubStateScreen } from './HubStateScreen';

export type HubLens = 'forum' | 'dayResults' | 'state' | 'activity' | 'direction' | 'groups' | 'participant';

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

function HubShell({ onOpenCard }: { onOpenCard: (id: number) => void }) {
  const [lens, setLens] = useState<HubLens>('forum');
  return (
    <div className="adm-dash-stack">
      <HubToolbar lens={lens} onLensChange={setLens} />
      {lens === 'forum' && <HubForumScreen onLensChange={setLens} />}
      {lens === 'dayResults' && <HubDayResultsScreen />}
      {lens === 'state' && <HubStateScreen />}
      {lens === 'activity' && <HubActivityScreen />}
      {lens === 'direction' && <HubDirectionScreen onOpenCard={onOpenCard} />}
      {lens === 'groups' && <HubGroupsScreen onLensChange={setLens} />}
      {lens === 'participant' && <HubParticipantScreen onOpenCard={onOpenCard} />}
    </div>
  );
}

import type { AdminTabProps } from '../admin/types';
import { AnalyticsShell } from './AnalyticsShell';

export type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

export type AnalyticsTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

export function AnalyticsTab(props: AnalyticsTabProps) {
  return <AnalyticsShell {...props} />;
}

import type { Tab } from '../../tabs';

export type AdminTabProps = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
  reloadKey: number;
  setTab?: (tab: Tab) => void;
  adminRole?: string;
};

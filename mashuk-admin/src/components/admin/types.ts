import type { Tab } from '../../tabs';

export type AdminActOptions = {
  /** Default true. Set false for local UI actions (e.g. image upload) that must not remount tabs. */
  reload?: boolean;
};

export type AdminBlockFocus = {
  tab: Tab;
  questionsKind?: string;
  anchor?: string;
  label?: string;
};

export type AdminTabProps = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string, opts?: AdminActOptions) => void;
  reloadKey: number;
  setTab?: (tab: Tab) => void;
  adminRole?: string;
  questionsFocusKind?: string | null;
  questionsFocusNonce?: number;
  onOpenBlock?: (focus: AdminBlockFocus) => void;
};

import { useEffect } from 'react';
import { EventEditorForm } from './EventEditorForm';
import type { EventDraft } from './eventEditorShared';
import type { ProgramBlockType, ProgramEvent, ProgramPlace, ProgramSpeaker, ThematicTag } from './types';

export type DrawerState =
  | { open: false }
  | { open: true; mode: 'create'; initialDraft: Partial<EventDraft> }
  | { open: true; mode: 'edit'; event: ProgramEvent };

type Props = {
  drawer: DrawerState;
  onClose: () => void;
  allTags: ThematicTag[];
  allPlaces: ProgramPlace[];
  blockTypes: ProgramBlockType[];
  speakers: ProgramSpeaker[];
  directions: { id: number; name: string }[];
  daySchedulePublished: boolean;
  onSaved: () => void;
  onGoToDay?: (day: number) => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
};

export function EventEditorDrawer({
  drawer,
  onClose,
  allTags,
  allPlaces,
  blockTypes,
  speakers,
  directions,
  daySchedulePublished,
  onSaved,
  onGoToDay,
  adminFetch,
  act,
}: Props) {
  useEffect(() => {
    if (!drawer.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer.open, onClose]);

  if (!drawer.open) return null;

  const title = drawer.mode === 'create'
    ? `Новое событие · день ${drawer.initialDraft.dayNumber ?? '—'}`
    : (drawer.event.title || 'Событие');

  return (
    <>
      <button type="button" className="adm-program-drawer-backdrop" aria-label="Закрыть" onClick={onClose} />
      <aside className="adm-program-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-program-drawer-title">
        <header className="adm-program-drawer-head">
          <h3 id="adm-program-drawer-title">{title}</h3>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="adm-program-drawer-body">
          {drawer.mode === 'create' ? (
            <EventEditorForm
              mode="create"
              initialDraft={drawer.initialDraft}
              allTags={allTags}
              allPlaces={allPlaces}
              blockTypes={blockTypes}
              speakers={speakers}
              directions={directions}
              daySchedulePublished={daySchedulePublished}
              onSaved={onSaved}
              onClose={onClose}
              onGoToDay={onGoToDay}
              adminFetch={adminFetch}
              act={act}
            />
          ) : (
            <EventEditorForm
              mode="edit"
              event={drawer.event}
              allTags={allTags}
              allPlaces={allPlaces}
              blockTypes={blockTypes}
              speakers={speakers}
              directions={directions}
              daySchedulePublished={daySchedulePublished}
              onSaved={onSaved}
              onClose={onClose}
              onGoToDay={onGoToDay}
              adminFetch={adminFetch}
              act={act}
            />
          )}
        </div>
      </aside>
    </>
  );
}

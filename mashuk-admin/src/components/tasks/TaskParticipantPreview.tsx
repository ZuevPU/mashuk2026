import type { TaskDraft } from './types';

type Props = {
  draft: TaskDraft;
  title?: string;
  categoryName?: string;
  points?: number;
};

export function TaskParticipantPreview({ draft, title, categoryName, points }: Props) {
  const displayTitle = title || draft.title || 'Название задания';
  const pts = points ?? draft.points;
  return (
    <div className="card adm-task-preview">
      <p className="adm-muted" style={{ fontSize: 12 }}>Превью карточки участника</p>
      <div style={{ border: '1px solid #E8E2D8', borderRadius: 12, padding: 14, background: '#FFFBF5' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{categoryName || 'Категория'}</div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{displayTitle}</div>
        {draft.shortDescription && (
          <p style={{ fontSize: 13, marginTop: 8, color: '#555' }}>{draft.shortDescription}</p>
        )}
        {(draft.descriptionHtml || draft.shortDescription) && (
          <div
            className="adm-task-preview-desc"
            style={{ fontSize: 13, marginTop: 8, color: '#444' }}
            dangerouslySetInnerHTML={{ __html: draft.descriptionHtml || '' }}
          />
        )}
        {!draft.shortDescription && !draft.descriptionHtml && (
          <p style={{ fontSize: 13, marginTop: 8, color: '#888' }}>Описание задания</p>
        )}
        <div style={{ marginTop: 10, fontSize: 14 }}>+{pts} ⚡ Опыт</div>
      </div>
    </div>
  );
}

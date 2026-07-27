import type { QuestionDraft } from './types';
import { answerTypeLabel, kindLabel } from './types';

const EMOTIONS = ['😊', '😌', '🤔', '✨', '💪', '😴'];

export function QuestionParticipantPreview({ draft }: { draft: QuestionDraft }) {
  const displayTitle = draft.text.trim() || draft.title;
  return (
    <div className="card" style={{ marginBottom: 16, background: '#FAFAF8', border: '1px dashed #C4B5A0' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Превью для участника</div>
      <div style={{ fontSize: 12, color: '#666' }}>{kindLabel(draft.questionKind)} · {answerTypeLabel(draft.answerType)}</div>
      {draft.subtitle && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{draft.subtitle}</div>}
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{displayTitle}</div>

      {draft.answerType === 'text' && (
        <textarea readOnly placeholder="Ваш ответ…" style={{ width: '100%', marginTop: 12, minHeight: 72, borderRadius: 8, padding: 8 }} />
      )}
      {(draft.answerType === 'scale_5' || draft.answerType === 'scale_10') && (
        <div style={{ marginTop: 12 }}>
          <input type="range" min={1} max={draft.answerType === 'scale_5' ? 5 : 10} defaultValue={3} style={{ width: '100%' }} />
        </div>
      )}
      {draft.answerType === 'emotion' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {EMOTIONS.map(e => (
            <span key={e} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 }}>{e}</span>
          ))}
        </div>
      )}
      {(draft.answerType === 'choice' || draft.answerType === 'multi') && (
        <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none' }}>
          {(draft.options.length ? draft.options : [{ label: 'Вариант 1', value: '1' }]).map((o, i) => (
            <li key={i} style={{ padding: '8px 10px', border: '1px solid #E0DAD0', borderRadius: 8, marginBottom: 6 }}>
              {draft.answerType === 'multi' ? '☐' : '○'} {o.label}
            </li>
          ))}
        </ul>
      )}
      {draft.isRequired && <div style={{ fontSize: 11, color: '#C53030', marginTop: 8 }}>Обязательный вопрос</div>}
      {draft.points > 0 && <div style={{ fontSize: 11, color: '#2D6A4F', marginTop: 4 }}>+{draft.points} к Пути</div>}
    </div>
  );
}

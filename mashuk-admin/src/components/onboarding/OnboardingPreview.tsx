import type { AdminRole, DiagQuestion, GoalQuestion, InterestGroup } from './types';

type Props = {
  goalQuestions: GoalQuestion[];
  interestGroups: InterestGroup[];
  diagQuestions: DiagQuestion[];
  roles: AdminRole[];
};

const TYPE_LABEL: Record<GoalQuestion['type'], string> = {
  open: 'свободный ответ',
  choice: 'один вариант',
  multi: 'несколько вариантов',
};

export function OnboardingPreview({ goalQuestions, interestGroups, diagQuestions, roles }: Props) {
  const sampleQ = diagQuestions[0];
  return (
    <div className="adm-forum-block card adm-onboarding-preview">
      <h3>Превью для дирекции</h3>
      <p className="adm-forum-hint">
        Упрощённый вид этапов — как их увидит участник (без VK и без отправки ответов).
      </p>

      <section className="card adm-forum-nested-card">
        <h4>Регистрация → Цели</h4>
        <ol className="adm-onboarding-preview-list">
          {goalQuestions.map((q, i) => (
            <li key={q.id || i}>
              <strong>Вопрос {i + 1}.</strong> {q.text || '—'}
              <span className="adm-muted"> ({TYPE_LABEL[q.type]})</span>
              {q.showWhen?.questionId && (
                <div className="adm-muted" style={{ fontSize: 12 }}>по условию от предыдущего ответа</div>
              )}
              {(q.type === 'choice' || q.type === 'multi') && q.options.length > 0 && (
                <ul>
                  {q.options.filter(o => o.trim()).map((o, oi) => (
                    <li key={oi}>{o}</li>
                  ))}
                  {q.allowOther && <li>{q.otherLabel || 'Свой вариант'}</li>}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="card adm-forum-nested-card">
        <h4>Интересы</h4>
        {interestGroups.map((g, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div className="adm-label">{g.title}</div>
            <div className="adm-program-tag-row">
              {g.tags.slice(0, 8).map(t => (
                <span key={t} className="tag-chip">{t}</span>
              ))}
              {g.tags.length > 8 && <span className="adm-muted">+{g.tags.length - 8}</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="card adm-forum-nested-card">
        <h4>Диагностика (пример вопроса 1)</h4>
        {sampleQ && (
          <>
            <p>{sampleQ.text}</p>
            <ul>
              {sampleQ.options.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card adm-forum-nested-card">
        <h4>Результат — роли</h4>
        <div className="adm-onboarding-preview-roles">
          {roles.map(r => (
            <div key={r.id} className="adm-onboarding-preview-role">
              <strong>{r.name}</strong>
              <p className="adm-muted">{(r.essence || '').slice(0, 120)}{(r.essence || '').length > 120 ? '…' : ''}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

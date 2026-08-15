export type ExchangeLimitsForm = {
  maxQuestionsTotal: number;
  pointsPerQuestion: number;
  maxAnswersForPoints: number;
  pointsPerAnswer: number;
};

type Props = {
  form: ExchangeLimitsForm;
  onChange: (patch: Partial<ExchangeLimitsForm>) => void;
  onSave: () => void;
  onOpenLevels?: () => void;
};

export function ExchangeLimitsSettings({ form, onChange, onSave, onOpenLevels }: Props) {
  return (
    <div className="card adm-forum-block" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Обмен опытом · лимиты и баллы</h3>
      <p className="adm-muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>
        Правила для всех участников. Вопросы: лимит на календарный день (МСК) и баллы за каждый одобренный.
        Ответы: можно отвечать без ограничений, но баллы начисляются только за первые N ответов на вопросы других.
        Баллы здесь и в «Системе баллов» — одно и то же: сохранение в любом месте обновляет оба экрана.
      </p>
      {onOpenLevels && (
        <p style={{ margin: '-4px 0 12px' }}>
          <button type="button" className="adm-link" onClick={onOpenLevels}>
            Открыть ставки в системе баллов
          </button>
        </p>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Вопросы участника</div>
          <div className="form-row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Сколько вопросов можно задать (в день)
              <input
                type="number"
                className="adm-input"
                min={0}
                max={10000}
                step={1}
                value={form.maxQuestionsTotal}
                onChange={e => onChange({ maxQuestionsTotal: Number(e.target.value) })}
                style={{ width: 140 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Баллов за один вопрос
              <input
                type="number"
                className="adm-input"
                min={0}
                max={10000}
                step={1}
                value={form.pointsPerQuestion}
                onChange={e => onChange({ pointsPerQuestion: Number(e.target.value) })}
                style={{ width: 140 }}
              />
            </label>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ответы на вопросы других</div>
          <div className="form-row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Сколько ответов дают баллы
              <input
                type="number"
                className="adm-input"
                min={0}
                max={10000}
                step={1}
                value={form.maxAnswersForPoints}
                onChange={e => onChange({ maxAnswersForPoints: Number(e.target.value) })}
                style={{ width: 140 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Баллов за один ответ
              <input
                type="number"
                className="adm-input"
                min={0}
                max={10000}
                step={1}
                value={form.pointsPerAnswer}
                onChange={e => onChange({ pointsPerAnswer: Number(e.target.value) })}
                style={{ width: 140 }}
              />
            </label>
          </div>
          <p className="adm-muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
            После исчерпания лимита ответов с баллами участник может продолжать отвечать, но без начисления баллов.
          </p>
        </div>

        <div>
          <button type="button" className="adm-btn" onClick={onSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

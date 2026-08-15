import type { InterestGroup } from './types';

type Props = {
  groups: InterestGroup[];
  interestMin: number;
  interestMax: number;
  onLimitsChange: (min: number, max: number) => void;
  onSave: () => void;
  dirty: boolean;
  onOpenSystem?: () => void;
};

export function InterestsStepEditor({
  groups,
  interestMin,
  interestMax,
  onLimitsChange,
  onSave,
  dirty,
  onOpenSystem,
}: Props) {
  const tagCount = groups.reduce((n, g) => n + g.tags.length, 0);

  return (
    <div className="card adm-forum-block adm-kb-panel">
      <div className="adm-kb-panel-head">
        <h3>Шаг «Интересы»</h3>
        <p className="adm-kb-panel-sub">
          Участник выбирает интересы — по ним строятся рекомендации в программе.
          Список правится только в{' '}
          {onOpenSystem ? (
            <button type="button" className="adm-link-btn" onClick={onOpenSystem}>
              Система → Интересы
            </button>
          ) : (
            'Система → Интересы'
          )}
          .
        </p>
      </div>

      <div className="adm-forum-grid-2" style={{ marginBottom: 12 }}>
        <label className="adm-field">
          <span className="adm-label">Минимум интересов</span>
          <input
            type="number"
            className="adm-input"
            min={1}
            max={20}
            value={interestMin}
            onChange={e => {
              const min = Math.max(1, Number(e.target.value) || 1);
              onLimitsChange(min, Math.max(min, interestMax));
            }}
          />
        </label>
        <label className="adm-field">
          <span className="adm-label">Максимум интересов</span>
          <input
            type="number"
            className="adm-input"
            min={1}
            max={30}
            value={interestMax}
            onChange={e => {
              const max = Math.max(1, Number(e.target.value) || 1);
              onLimitsChange(Math.min(interestMin, max), max);
            }}
          />
        </label>
      </div>
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        Сейчас участник должен выбрать от {interestMin} до {interestMax} интересов.
        В каталоге {tagCount}.
      </p>

      {groups.map((group, gi) => (
        <div key={`${group.title}-${gi}`} className="card adm-forum-nested-card">
          <div className="adm-label">{group.title}</div>
          <div className="adm-program-tag-row" style={{ marginTop: 10 }}>
            {group.tags.length === 0 ? (
              <p className="adm-muted" style={{ margin: 0 }}>Пока пусто — добавьте интересы в Системе.</p>
            ) : group.tags.map((tag, ti) => (
              <span key={`${tag}-${ti}`} className="tag-chip adm-program-tag-chip">{tag}</span>
            ))}
          </div>
        </div>
      ))}

      <div className="adm-forum-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          Сохранить лимиты{dirty ? ' •' : ''}
        </button>
        {onOpenSystem && (
          <button type="button" className="adm-btn adm-btn-secondary" onClick={onOpenSystem}>
            Открыть Система → Интересы
          </button>
        )}
      </div>
    </div>
  );
}

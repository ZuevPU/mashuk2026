import { RowActionsMenu } from '../participants/RowActionsMenu';
import { label } from '../../labels/ru';
import { parseRuleParts, type Medal } from './types';

type Props = {
  medals: Medal[];
  onEdit: (m: Medal) => void;
  onHide: (m: Medal) => void;
  onDelete: (id: number) => void;
};

function categoryLabel(category?: string | null): string {
  if (!category) return '—';
  const keyed = label(`medal_cat_${category}`);
  return keyed !== `medal_cat_${category}` ? keyed : category;
}

export function MedalsListTable({ medals, onEdit, onHide, onDelete }: Props) {
  if (medals.length === 0) {
    return <p className="adm-muted">У этой смены нет медалей.</p>;
  }

  return (
    <div className="adm-mod-list">
      {medals.map(m => {
        const rule = m.awardType === 'auto' && m.conditionRule
          ? (() => {
            const p = parseRuleParts(m.conditionRule);
            return `${p.metric} ≥ ${p.value}`;
          })()
          : null;
        return (
          <article key={m.id} className="adm-mod-item">
            <div className="adm-mod-item-row1">
              <div className="adm-mod-item-main">
                <div className="adm-mod-item-title-line">
                  {m.iconUrl ? (
                    <img src={m.iconUrl} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} />
                  ) : (
                    <span className="adm-tasks-chip">без иконки</span>
                  )}
                  <button type="button" className="adm-tasks-title" onClick={() => onEdit(m)}>
                    {m.name}
                  </button>
                  <span className="adm-tasks-status">{label(m.level ?? '')}</span>
                  {m.visibility === 'hidden' ? (
                    <span className="adm-tasks-status">Скрытая</span>
                  ) : (
                    <span className="adm-tasks-status is-ok">Открытая</span>
                  )}
                </div>
                <p className="adm-kb-panel-sub" style={{ marginTop: 4 }}>
                  {[
                    categoryLabel(m.category),
                    m.awardType === 'auto' ? 'Автоматическая' : 'Ручная',
                    rule,
                    `выдано: ${m.awardedCount ?? 0}`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="adm-mod-item-actions" style={{ marginTop: 0 }}>
                <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => onEdit(m)}>
                  Изменить
                </button>
                <RowActionsMenu
                  actions={[
                    ...(m.visibility !== 'hidden'
                      ? [{ label: 'Скрыть', onClick: () => onHide(m) }]
                      : []),
                    { label: 'Удалить', onClick: () => onDelete(m.id), danger: true },
                  ]}
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

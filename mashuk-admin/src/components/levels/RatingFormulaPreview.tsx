import { useState } from 'react';
import type { ThresholdRow } from './levelPreviewUtils';
import { levelNameForPoints } from './levelPreviewUtils';

type Props = {
  pathRows: ThresholdRow[];
  expRows: ThresholdRow[];
};

export function RatingFormulaPreview({ pathRows, expRows }: Props) {
  const [open, setOpen] = useState(true);
  const [pathSample, setPathSample] = useState(120);
  const [expSample, setExpSample] = useState(80);

  const pathLevel = levelNameForPoints(pathSample, pathRows);
  const expLevel = levelNameForPoints(expSample, expRows);
  const totalSample = pathSample + expSample;

  return (
    <div className="card adm-forum-block adm-kb-panel">
      <div className="adm-kb-panel-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3>Как считается рейтинг</h3>
          <p className="adm-kb-panel-sub">Путь + Опыт + Бонус → итоговый счётчик участника.</p>
        </div>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setOpen(v => !v)}>
          {open ? 'Свернуть' : 'Развернуть'}
        </button>
      </div>
      {open && (
        <>
          <p className="adm-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            <strong>Итоговый рейтинг</strong> участника = баллы «Путь» + «Опыт» + «Бонус» (три колонки в карточке).
            Каждое начисление попадает в журнал <code>points_log</code> с типом действия (<code>actionType</code>).
          </p>
          <ul className="adm-muted" style={{ fontSize: 12, lineHeight: 1.5, paddingLeft: 18 }}>
            <li>
              Баллы <strong>конкретного вопроса</strong> задаются в разделе «Вопросы» (таблица ставок ниже — базовый
              fallback для <code>question_answer</code>).
            </li>
            <li>
              Баллы <strong>задания</strong> — в карточке задания; при начислении используется очки задания или
              ставка категории (<code>task_cat_*</code> / <code>task_complete</code>).
            </li>
            <li>
              Счётчик <strong>«Идей»</strong> на главной — число записей копилки с тегом «идея», без отдельной линии XP.
            </li>
          </ul>

          <div className="adm-forum-grid-2" style={{ marginTop: 12 }}>
            <label className="adm-field">
              <span className="adm-label">Пример: баллы «Путь»</span>
              <input
                type="number"
                min={0}
                className="adm-input"
                value={pathSample}
                onChange={e => setPathSample(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="adm-muted" style={{ fontSize: 11 }}>
                → {pathLevel}
              </span>
            </label>
            <label className="adm-field">
              <span className="adm-label">Пример: баллы «Опыт»</span>
              <input
                type="number"
                min={0}
                className="adm-input"
                value={expSample}
                onChange={e => setExpSample(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="adm-muted" style={{ fontSize: 11 }}>
                → {expLevel}
              </span>
            </label>
          </div>
          <p className="adm-muted" style={{ fontSize: 11, marginBottom: 0 }}>
            Сумма Путь+Опыт (без бонуса) в примере: {totalSample}. Бонусы добавляются отдельными правилами и action type
            из группы «Бонусы».
          </p>
        </>
      )}
    </div>
  );
}

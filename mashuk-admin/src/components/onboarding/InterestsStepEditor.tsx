import { useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import type { InterestGroup } from './types';

type Props = {
  groups: InterestGroup[];
  interestMin: number;
  interestMax: number;
  onChange: (next: InterestGroup[]) => void;
  onLimitsChange: (min: number, max: number) => void;
  onSave: () => void;
  dirty: boolean;
  onOpenProgram?: () => void;
};

export function InterestsStepEditor({
  groups,
  interestMin,
  interestMax,
  onChange,
  onLimitsChange,
  onSave,
  dirty,
  onOpenProgram,
}: Props) {
  const [newTagByGroup, setNewTagByGroup] = useState<Record<number, string>>({});

  const addTag = (gi: number) => {
    const raw = (newTagByGroup[gi] || '').trim();
    if (!raw) return;
    const next = groups.map((g, idx) => {
      if (idx !== gi) return g;
      if (g.tags.includes(raw)) return g;
      return { ...g, tags: [...g.tags, raw] };
    });
    onChange(next);
    setNewTagByGroup(prev => ({ ...prev, [gi]: '' }));
  };

  const bulkImport = (gi: number, text: string) => {
    const added = text.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean);
    if (!added.length) return;
    const next = groups.map((g, idx) => {
      if (idx !== gi) return g;
      const tags = [...g.tags];
      for (const t of added) {
        if (!tags.includes(t)) tags.push(t);
      }
      return { ...g, tags };
    });
    onChange(next);
  };

  return (
    <div className="card adm-forum-block adm-kb-panel">
      <div className="adm-kb-panel-head">
        <h3>Шаг «Интересы»</h3>
        <p className="adm-kb-panel-sub">
          Участник выбирает теги интересов — по ним строятся рекомендации в программе.
          {onOpenProgram && (
            <>
              {' '}
              Теги должны совпадать с{' '}
              <button type="button" className="adm-link-btn" onClick={onOpenProgram}>
                тематическими тегами программы →
              </button>
            </>
          )}
        </p>
      </div>

      <div className="adm-forum-grid-2" style={{ marginBottom: 12 }}>
        <label className="adm-field">
          <span className="adm-label">Минимум тегов</span>
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
          <span className="adm-label">Максимум тегов</span>
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
      </p>

      {groups.map((group, gi) => (
        <div key={gi} className="card adm-forum-nested-card">
          <label className="adm-label">Название группы</label>
          <input
            className="adm-input"
            value={group.title}
            onChange={e => {
              onChange(groups.map((g, idx) => (idx === gi ? { ...g, title: e.target.value } : g)));
            }}
          />
          <div className="adm-program-tag-row" style={{ marginTop: 10 }}>
            {group.tags.map((tag, ti) => (
              <span key={`${tag}-${ti}`} className="tag-chip adm-program-tag-chip">
                {tag}
                <button
                  type="button"
                  className="adm-tag-icon-btn adm-tag-icon-btn-delete"
                  title="Удалить тег"
                  aria-label="Удалить тег"
                  onClick={() => {
                    onChange(groups.map((g, idx) => (
                      idx === gi ? { ...g, tags: g.tags.filter((_, i) => i !== ti) } : g
                    )));
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <input
              className="adm-input"
              placeholder="Новый тег — Enter"
              value={newTagByGroup[gi] || ''}
              onChange={e => setNewTagByGroup(prev => ({ ...prev, [gi]: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(gi);
                }
              }}
            />
            <button type="button" className="adm-btn" onClick={() => addTag(gi)}>Добавить тег</button>
          </div>
          <details className="adm-forum-details" style={{ marginTop: 8 }}>
            <summary>Вставить списком (для опытных)</summary>
            <textarea
              className="adm-input adm-textarea"
              rows={3}
              placeholder="Теги через запятую или с новой строки"
              onBlur={e => {
                if (e.target.value.trim()) bulkImport(gi, e.target.value);
                e.target.value = '';
              }}
            />
          </details>
          <button
            type="button"
            className="adm-btn adm-btn-danger"
            style={{ marginTop: 10 }}
            onClick={() => {
              if (!confirmDelete('Удалить эту группу интересов?')) return;
              onChange(groups.filter((_, idx) => idx !== gi));
            }}
          >
            Удалить группу
          </button>
        </div>
      ))}
      <button
        type="button"
        className="adm-btn"
        onClick={() => onChange([...groups, { title: 'Новая группа', tags: [] }])}
      >
        Добавить группу
      </button>
      <div className="adm-forum-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          Сохранить интересы{dirty ? ' •' : ''}
        </button>
      </div>
    </div>
  );
}

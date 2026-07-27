import { useRef } from 'react';
import type { AdminTabProps } from '../admin/types';
import type { MedalDraft, RuleMetricOption } from './types';

type Props = {
  draft: MedalDraft;
  metrics: RuleMetricOption[];
  editing: boolean;
  onChange: (patch: Partial<MedalDraft>) => void;
  onSave: () => void;
  onBack: () => void;
  onEvaluate: () => void;
  adminFetch: AdminTabProps['adminFetch'];
  act: AdminTabProps['act'];
};

export function MedalForm({
  draft,
  metrics,
  editing,
  onChange,
  onSave,
  onBack,
  onEvaluate,
  adminFetch,
  act,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  const uploadIcon = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      act(async () => {
        const res = await adminFetch('/upload-image', {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        });
        onChange({ iconUrl: res.url });
      }, 'Иконка загружена');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="card adm-forum-block">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onBack}>← К списку</button>
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          {editing ? 'Сохранить' : 'Создать'}
        </button>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onEvaluate}>
          Авто-оценка
        </button>
      </div>

      <label className="adm-field">
        <span className="adm-label">Название</span>
        <input className="adm-input" value={draft.name} onChange={e => onChange({ name: e.target.value })} />
      </label>

      <label className="adm-field">
        <span className="adm-label">Описание (rich text)</span>
        <div className="adm-rich-toolbar">
          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => document.execCommand('bold')}>B</button>
          <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={() => document.execCommand('insertUnorderedList')}>•</button>
        </div>
        <div
          ref={editorRef}
          className="adm-input adm-rich-editor"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: draft.descriptionHtml }}
          onInput={() => onChange({ descriptionHtml: editorRef.current?.innerHTML || '' })}
        />
      </label>

      <div className="adm-forum-grid-2">
        <label className="adm-field">
          <span className="adm-label">Иконка (SVG/PNG)</span>
          <input
            type="file"
            accept="image/*"
            className="adm-input"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) uploadIcon(f);
            }}
          />
          {draft.iconUrl && (
            <img src={draft.iconUrl} alt="" style={{ marginTop: 8, width: 48, height: 48, objectFit: 'contain' }} />
          )}
        </label>
        <label className="adm-field">
          <span className="adm-label">Категория</span>
          <select className="adm-input" value={draft.category} onChange={e => onChange({ category: e.target.value })}>
            <option value="tasks">Задания</option>
            <option value="piggybank">Копилка</option>
            <option value="reflection">Рефлексия</option>
            <option value="points">Баллы</option>
            <option value="program">Программа</option>
            <option value="exchange">Обмен</option>
          </select>
        </label>
      </div>

      <div className="adm-field">
        <span className="adm-label">Уровень</span>
        <div className="adm-seg">
          {(['bronze', 'silver', 'gold'] as const).map(l => (
            <button key={l} type="button" className={draft.level === l ? 'on' : ''} onClick={() => onChange({ level: l })}>
              {l === 'bronze' ? 'Бронза' : l === 'silver' ? 'Серебро' : 'Золото'}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-field">
        <span className="adm-label">Тип выдачи</span>
        <div className="adm-seg">
          <button type="button" className={draft.awardType === 'auto' ? 'on' : ''} onClick={() => onChange({ awardType: 'auto' })}>
            Автоматическая
          </button>
          <button type="button" className={draft.awardType === 'manual' ? 'on' : ''} onClick={() => onChange({ awardType: 'manual' })}>
            Ручная
          </button>
        </div>
      </div>

      {draft.awardType === 'auto' && (
        <div className="adm-field card" style={{ padding: 12, background: '#fafafa' }}>
          <span className="adm-label">Условие получения</span>
          <div className="adm-forum-grid-2" style={{ marginTop: 8 }}>
            <select
              className="adm-input"
              value={draft.ruleMetric}
              onChange={e => onChange({ ruleMetric: e.target.value })}
            >
              {metrics.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="adm-input"
              value={draft.ruleValue}
              onChange={e => onChange({ ruleValue: Number(e.target.value) || 1 })}
            />
          </div>
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 8 }}>
            Правило: <code>{draft.ruleMetric}&gt;={draft.ruleValue}</code>
          </p>
        </div>
      )}

      <div className="adm-field">
        <span className="adm-label">Тип видимости</span>
        <label style={{ display: 'block', marginTop: 6 }}>
          <input
            type="radio"
            name="visibility"
            checked={draft.visibility === 'open'}
            onChange={() => onChange({ visibility: 'open' })}
          />
          {' '}Открытая — участник видит условие в разделе «Медали» с прогрессом
        </label>
        <p className="adm-muted" style={{ fontSize: 11, marginLeft: 22 }}>
          Примеры: «Посетил 5 активностей», «Собрал 20 записей в копилке»
        </p>
        <label style={{ display: 'block', marginTop: 8 }}>
          <input
            type="radio"
            name="visibility"
            checked={draft.visibility === 'hidden'}
            onChange={() => onChange({ visibility: 'hidden' })}
          />
          {' '}Скрытая — получает неожиданно, условие не показывается
        </label>
        <p className="adm-muted" style={{ fontSize: 11, marginLeft: 22 }}>
          Примеры: «7 дней подряд фиксировал мысли», «Помог 10 участникам в обмене»
        </p>
      </div>

      <div className="adm-field">
        <span className="adm-label">Статус</span>
        <div className="adm-seg">
          <button type="button" className={draft.isActive ? 'on' : ''} onClick={() => onChange({ isActive: true })}>
            Активна
          </button>
          <button type="button" className={!draft.isActive ? 'on' : ''} onClick={() => onChange({ isActive: false })}>
            Черновик
          </button>
        </div>
      </div>
    </div>
  );
}

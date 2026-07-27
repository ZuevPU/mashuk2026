import { useEffect, useState } from 'react';
import { DEFAULT_ROLE_ICONS, roleIcon } from './roleMatrix';
import type { AdminRole } from './types';

type Draft = {
  essence: string;
  inClass: string;
  keywords: string;
  iconKey: string;
};

type Props = {
  role: AdminRole | null;
  onClose: () => void;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
  onSaved: (role: AdminRole) => void;
};

export function RoleEditModal({ role, onClose, adminFetch, act, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>({
    essence: '',
    inClass: '',
    keywords: '',
    iconKey: '',
  });

  useEffect(() => {
    if (!role) return;
    setDraft({
      essence: role.essence || '',
      inClass: role.inClass || '',
      keywords: role.keywords || '',
      iconKey: role.iconKey || DEFAULT_ROLE_ICONS[role.roleKey as keyof typeof DEFAULT_ROLE_ICONS] || '◆',
    });
  }, [role]);

  if (!role) return null;

  const save = () => act(async () => {
    const res = await adminFetch(`/roles/${role.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        essence: draft.essence,
        inClass: draft.inClass,
        keywords: draft.keywords,
        iconKey: draft.iconKey || null,
      }),
    });
    onSaved({ ...role, ...(res.role as AdminRole) });
    onClose();
  }, `Роль «${role.name}» сохранена`);

  return (
    <div className="adm-modal-backdrop" onClick={onClose} role="presentation">
      <div className="adm-modal card adm-role-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="adm-forum-toolbar">
          <h3 style={{ margin: 0 }}>{role.name}</h3>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>✕</button>
        </div>
        <p className="adm-muted adm-forum-hint">
          Ключ: <code>{role.roleKey}</code>
          {role.quadrant && <> · {role.quadrant}</>}
        </p>
        <label className="adm-field">
          <span className="adm-label">Иконка</span>
          <input
            className="adm-input"
            value={draft.iconKey}
            onChange={e => setDraft({ ...draft, iconKey: e.target.value })}
            maxLength={32}
            placeholder="Эмодзи или символ"
          />
          <span className="adm-muted" style={{ fontSize: 12 }}>Превью: {roleIcon({ roleKey: role.roleKey, iconKey: draft.iconKey })}</span>
        </label>
        <label className="adm-label">Суть (описание для участника)</label>
        <textarea
          className="adm-input adm-textarea"
          rows={3}
          value={draft.essence}
          onChange={e => setDraft({ ...draft, essence: e.target.value })}
        />
        <label className="adm-label">Проявления в классе</label>
        <textarea
          className="adm-input adm-textarea"
          rows={2}
          value={draft.inClass}
          onChange={e => setDraft({ ...draft, inClass: e.target.value })}
        />
        <label className="adm-label">Ключевые слова</label>
        <input
          className="adm-input"
          value={draft.keywords}
          onChange={e => setDraft({ ...draft, keywords: e.target.value })}
        />
        <div className="adm-forum-actions" style={{ marginTop: 14 }}>
          <button type="button" className="adm-btn adm-btn-primary" onClick={save}>Сохранить</button>
          <button type="button" className="adm-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

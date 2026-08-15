import { useEffect, useMemo, useState } from 'react';

type EveningField = {
  key: string;
  type: string;
  label: string;
  options?: string[];
  allowOther?: boolean;
};

type DayPayload = {
  dayNumber: number;
  filledAt: string | null;
  tomorrowRoleKey: string | null;
  ratings: Record<string, unknown>;
  fields: EveningField[];
};

type FormPayload = {
  canEdit: boolean;
  participant: { id: number; name: string; direction: string; group: string };
  days: DayPayload[];
  roles: Array<{ roleKey: string; name: string }>;
};

type Props = {
  participantId: number;
  adminFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  onClose: () => void;
};

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asBool(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 'yes' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'no' || value === 0 || value === '0') return false;
  return null;
}

export function ForumResultsAnswerSheet({ participantId, adminFetch, onClose }: Props) {
  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [dayNumber, setDayNumber] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    adminFetch(`/participants/${participantId}/evening-form`)
      .then(res => {
        const next = res as FormPayload;
        setPayload(next);
        const last = next.days[next.days.length - 1];
        setDayNumber(last?.dayNumber ?? null);
        setForm({ ...(last?.ratings || {}) });
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось открыть анкету');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, participantId]);

  const day = useMemo(
    () => payload?.days.find(d => d.dayNumber === dayNumber) ?? payload?.days[0],
    [payload, dayNumber],
  );

  useEffect(() => {
    if (!day) return;
    setForm({ ...day.ratings });
  }, [day?.dayNumber]);

  return (
    <div className="adm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="adm-modal adm-frp-sheet"
        role="dialog"
        aria-labelledby="adm-frp-sheet-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="adm-frp-sheet-head">
          <div>
            <div className="adm-frp-sheet-kicker">Анкета</div>
            <h3 id="adm-frp-sheet-title">{payload?.participant.name || 'Участник'}</h3>
            <p>
              {[payload?.participant.direction, payload?.participant.group].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>Закрыть</button>
        </header>

        {loading && <p className="adm-muted adm-frp-sheet-pad">Загрузка…</p>}
        {err && <p className="adm-frp-sheet-err">{err}</p>}

        {payload && day && (
          <>
            {payload.days.length > 1 && (
              <div className="adm-frp-days">
                {payload.days.map(d => (
                  <button
                    key={d.dayNumber}
                    type="button"
                    className={d.dayNumber === day.dayNumber ? 'on' : ''}
                    onClick={() => setDayNumber(d.dayNumber)}
                  >
                    День {d.dayNumber}
                  </button>
                ))}
              </div>
            )}

            <div className="adm-frp-sheet-body">
              {day.fields.map(field => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  value={form[field.key]}
                  roles={payload.roles}
                />
              ))}
            </div>

            <footer className="adm-frp-sheet-foot">
              <span className="adm-muted">Только просмотр. Ответы участника менять нельзя.</span>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  value,
  roles,
}: {
  field: EveningField;
  value: unknown;
  roles: Array<{ roleKey: string; name: string }>;
}) {
  if (field.type === 'scale_1_5' || field.type === 'scale_1_10') {
    const max = field.type === 'scale_1_10' ? 10 : 5;
    const current = typeof value === 'number' ? value : Number(value);
    return (
      <label className="adm-frp-field">
        <span>{field.label}</span>
        <div className="adm-frp-scale">
          {Array.from({ length: max }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              disabled
              className={current === n ? 'on' : ''}
            >
              {n}
            </button>
          ))}
        </div>
      </label>
    );
  }

  if (field.type === 'yes_no') {
    const current = asBool(value);
    return (
      <label className="adm-frp-field">
        <span>{field.label}</span>
        <div className="adm-frp-scale">
          <button type="button" disabled className={current === true ? 'on' : ''}>Да</button>
          <button type="button" disabled className={current === false ? 'on' : ''}>Нет</button>
        </div>
      </label>
    );
  }

  if (field.type === 'choice') {
    const options = field.options || [];
    const text = asText(value);
    const isOther = text && !options.includes(text);
    return (
      <label className="adm-frp-field">
        <span>{field.label}</span>
        <select
          className="adm-input"
          disabled
          value={isOther ? '__other__' : text}
        >
          <option value="">—</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          {field.allowOther && <option value="__other__">Свой вариант</option>}
        </select>
        {(field.allowOther && (isOther || text === '')) && (
          <input
            className="adm-input"
            disabled
            value={isOther ? text : ''}
            placeholder="Свой вариант"
          />
        )}
      </label>
    );
  }

  if (field.type === 'role_select') {
    return (
      <label className="adm-frp-field">
        <span>{field.label}</span>
        <select
          className="adm-input"
          disabled
          value={asText(value)}
        >
          <option value="">—</option>
          {roles.map(r => <option key={r.roleKey} value={r.roleKey}>{r.name}</option>)}
        </select>
      </label>
    );
  }

  if (field.type === 'program_event') {
    const items = Array.isArray((value as { items?: unknown[] } | null)?.items)
      ? (value as { items: Array<{ eventTitle?: string; parentEventTitle?: string; score?: number | null }> }).items
      : [];
    return (
      <label className="adm-frp-field">
        <span>{field.label}</span>
        {items.length === 0 ? (
          <p className="adm-muted" style={{ margin: 0 }}>Нет выбранных практик</p>
        ) : items.map((item, i) => (
          <div key={`${item.eventTitle}-${i}`} className="adm-frp-event">
            <em>{item.parentEventTitle || item.eventTitle}</em>
            <input
              className="adm-input"
              type="number"
              min={1}
              max={10}
              disabled
              value={item.score ?? ''}
            />
          </div>
        ))}
      </label>
    );
  }

  return (
    <label className="adm-frp-field">
      <span>{field.label}</span>
      <textarea
        className="adm-input"
        rows={3}
        disabled
        value={asText(value)}
      />
    </label>
  );
}

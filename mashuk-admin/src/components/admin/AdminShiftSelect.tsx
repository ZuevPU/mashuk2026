import { useEffect, useState } from 'react';
import {
  ADMIN_SHIFT_CHANGED_EVENT,
  adminFetch,
  getAdminEditingShiftId,
  setAdminEditingShiftId,
} from '../../admin/client';

type ShiftOpt = { id: number; name: string };

type Props = {
  label?: string;
  className?: string;
  reloadKey?: number;
};

export function AdminShiftSelect({
  label = 'Смена',
  className = 'admin-shift-select',
  reloadKey = 0,
}: Props) {
  const [options, setOptions] = useState<ShiftOpt[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(() => getAdminEditingShiftId());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/shift-options')
      .then((res: { shifts?: ShiftOpt[]; activeShiftId?: number | null }) => {
        if (cancelled) return;
        const list = res.shifts || [];
        setOptions(list);
        setActiveId(res.activeShiftId ?? null);
        const stored = getAdminEditingShiftId();
        const storedOk = stored != null && list.some(s => s.id === stored);
        const next = storedOk ? stored : (res.activeShiftId ?? list[0]?.id ?? null);
        if (next !== stored) setAdminEditingShiftId(next);
        setValue(next);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    const onChange = (e: Event) => {
      setValue((e as CustomEvent<number | null>).detail ?? getAdminEditingShiftId());
    };
    window.addEventListener(ADMIN_SHIFT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ADMIN_SHIFT_CHANGED_EVENT, onChange);
  }, []);

  return (
    <label className={className}>
      <span>{label}</span>
      <select
        className="adm-input"
        value={value ?? ''}
        disabled={!loaded || options.length === 0}
        onChange={e => setAdminEditingShiftId(e.target.value ? Number(e.target.value) : null)}
      >
        {!loaded && <option value="">Загрузка смен…</option>}
        {loaded && options.length === 0 && <option value="">Нет смен</option>}
        {loaded && !value && options.length > 0 && <option value="">Выберите смену</option>}
        {options.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.id === activeId ? ' · участники' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

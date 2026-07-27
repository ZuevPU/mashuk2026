import { useCallback, useEffect, useState } from 'react';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import { EnumOptions } from '../admin/EnumOptions';
import type { AdminTabProps } from '../admin/types';

const MEDAL_LEVELS = ['bronze', 'silver', 'gold'] as const;
const AWARD_TYPES = ['manual', 'auto'] as const;

type Medal = {
  id: number;
  name: string;
  description?: string;
  level?: string;
  awardType?: string;
  conditionRule?: string | null;
};

const defaultNewMedal = {
  name: '',
  description: '',
  level: 'bronze',
  awardType: 'manual',
  conditionRule: '',
};

export function MedalsTab({ adminFetch, act, reloadKey }: AdminTabProps) {
  const [medals, setMedals] = useState<Medal[]>([]);
  const [newMedal, setNewMedal] = useState({ ...defaultNewMedal });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/medals');
      setMedals(res.medals || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const createMedal = () =>
    act(async () => {
      await adminFetch('/medals', {
        method: 'POST',
        body: JSON.stringify(newMedal),
      });
      setNewMedal({ ...defaultNewMedal });
      await load();
    }, 'Медаль создана');

  const deleteMedal = (id: number) =>
    act(async () => {
      await adminFetch(`/medals/${id}`, { method: 'DELETE' });
      await load();
    }, 'Удалено');

  const runEvaluate = () =>
    act(async () => {
      await adminFetch('/medals/evaluate', { method: 'POST' });
      await load();
    }, 'Авто-оценка запущена');

  if (loading) {
    return <p className="adm-muted">Загрузка медалей…</p>;
  }

  return (
    <div className="adm-forum">
      <AdminPageHero
        title="Медали"
        hint="Каталог медалей и правила автоматической выдачи. Авто-оценка проверяет условия для всех участников."
      />

      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap' }}>
          <input
            className="adm-input"
            value={newMedal.name}
            onChange={e => setNewMedal({ ...newMedal, name: e.target.value })}
            placeholder="Название"
          />
          <input
            className="adm-input"
            value={newMedal.description}
            onChange={e => setNewMedal({ ...newMedal, description: e.target.value })}
            placeholder="Описание"
          />
          <select
            className="adm-input"
            value={newMedal.level}
            onChange={e => setNewMedal({ ...newMedal, level: e.target.value })}
          >
            <EnumOptions values={[...MEDAL_LEVELS]} />
          </select>
          <select
            className="adm-input"
            value={newMedal.awardType}
            onChange={e => setNewMedal({ ...newMedal, awardType: e.target.value })}
          >
            <EnumOptions values={[...AWARD_TYPES]} />
          </select>
          <input
            className="adm-input"
            value={newMedal.conditionRule}
            onChange={e => setNewMedal({ ...newMedal, conditionRule: e.target.value })}
            placeholder="tasks_completed>=1"
            style={{ minWidth: 160 }}
          />
          <button type="button" className="adm-btn adm-btn-primary" onClick={createMedal}>
            Создать
          </button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={runEvaluate}>
            Авто-оценка
          </button>
        </div>
      </div>

      <div className="card adm-forum-block">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Уровень</th>
              <th>Тип</th>
              <th>Правило</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {medals.map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{label(m.level ?? '')}</td>
                <td>{label(m.awardType ?? '')}</td>
                <td style={{ fontSize: 11 }}>{m.conditionRule || '—'}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary"
                    onClick={() => deleteMedal(m.id)}
                    aria-label="Удалить"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {medals.length === 0 && <p className="adm-muted">Медалей пока нет</p>}
      </div>
    </div>
  );
}

import { roleName } from '../onboarding/roleOptions';

type TooltipPayload = {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: number; color?: string }[];
  label?: unknown;
};

/** 5 зон эмоций (ключи API → подписи на графиках) */
export const ZONE_LABELS: Record<string, string> = {
  risk: 'Риск',
  fatigue: 'Усталость',
  neutral: 'Нейтраль',
  engagement: 'Включение',
  lift: 'Подъём',
};

export const ZONE_ORDER = ['risk', 'fatigue', 'neutral', 'engagement', 'lift'] as const;

/** 11 эмоций проверки состояния (как у участника) */
export const EMOTION_LABELS: Record<string, string> = {
  joy: 'Радость',
  calm: 'Спокойствие',
  interest: 'Интерес',
  inspiration: 'Вдохновение',
  confidence: 'Уверенность',
  tired: 'Усталость',
  anxiety: 'Тревога',
  irritation: 'Раздражение',
  sadness: 'Грусть',
  surprise: 'Удивление',
  focus: 'Сосредоточенность',
};

export const EMOTION_ORDER = [
  'joy',
  'calm',
  'interest',
  'inspiration',
  'confidence',
  'tired',
  'anxiety',
  'irritation',
  'sadness',
  'surprise',
  'focus',
] as const;

export const ZONE_COLORS: Record<string, string> = {
  risk: '#E53E3E',
  fatigue: '#DD6B20',
  neutral: '#718096',
  engagement: '#3182CE',
  lift: '#38A169',
};

export const TOUCHPOINT_LABELS: Record<string, string> = {
  total: 'Всего ответов по точкам',
  checkin: 'Проверка состояния',
  direction: 'Направление',
  lesson_important: 'Урок о важном',
  lesson_open: 'Открытый урок',
  evening: 'Итоги дня',
  point_a: 'Точка А',
  point_b: 'Точка Б',
};

export const PHASE_LABELS: Record<string, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
};

export function formatZoneName(key: string): string {
  if (!key) return '—';
  return ZONE_LABELS[key] ?? ZONE_LABELS[key.toLowerCase()] ?? key;
}

export function formatEmotionName(key: string | null | undefined): string {
  if (!key) return '—';
  const k = key.trim().toLowerCase();
  return EMOTION_LABELS[k] ?? key.trim();
}

export function formatTouchpointKey(key: string): string {
  return TOUCHPOINT_LABELS[key] ?? key.replace(/_/g, ' ');
}

export function formatForumDay(day: number | string | undefined): string {
  if (day == null || day === '') return '—';
  const s = String(day).replace(/^D/i, '');
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return `День ${n}`;
  return String(day);
}

export function formatChartLabel(label: unknown): string {
  if (label == null) return '';
  const s = String(label);
  if (ZONE_LABELS[s] || ZONE_LABELS[s.toLowerCase()]) return formatZoneName(s);
  if (EMOTION_LABELS[s] || EMOTION_LABELS[s.toLowerCase()]) return formatEmotionName(s);
  if (/^D\d+$/i.test(s)) return formatForumDay(s);
  return s;
}

/** Строки для линейного графика: один день — колонки по зонам */
export function zonesByDayRows(
  days: { day: number; zones: Record<string, number> }[] | undefined,
): Record<string, string | number>[] {
  if (!days?.length) return [];
  return days.map(d => {
    const row: Record<string, string | number> = { day: formatForumDay(d.day) };
    for (const key of ZONE_ORDER) {
      row[key] = d.zones?.[key] ?? 0;
    }
    return row;
  });
}

export function zonesToBarRows(zones: Record<string, number> | undefined) {
  if (!zones) return [];
  return ZONE_ORDER.filter(k => zones[k] != null).map(k => ({
    key: k,
    name: formatZoneName(k),
    value: zones[k] ?? 0,
  }));
}

const METRIC_LABELS: Record<string, string> = {
  value: 'Доля, %',
  count: 'Участников',
  answers: 'Ответы',
  touchpoints: 'Точки осмысления',
};

export function ChartTooltipRu({
  active,
  payload,
  label,
}: TooltipPayload) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 12,
        boxShadow: '0 8px 28px rgba(0,0,0,0.08)',
        maxWidth: 260,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#1d1d1f' }}>{formatChartLabel(label)}</div>
      {payload.map(p => {
        const dataKey = String(p.dataKey ?? '');
        const seriesName = p.name != null ? String(p.name) : '';
        const isPercent = dataKey === 'value' || ZONE_LABELS[dataKey];
        let shownName = seriesName;
        if (ZONE_LABELS[dataKey]) shownName = formatZoneName(dataKey);
        else if (METRIC_LABELS[dataKey]) shownName = METRIC_LABELS[dataKey];
        else if (METRIC_LABELS[seriesName]) shownName = METRIC_LABELS[seriesName];
        else if (seriesName && !seriesName.includes('_')) shownName = seriesName;
        else if (dataKey) shownName = roleName(dataKey);
        return (
          <div key={`${dataKey}-${seriesName}`} style={{ color: '#86868b', marginTop: 2 }}>
            <span style={{ color: p.color ?? '#1F3A5F' }}>{shownName}</span>
            {': '}
            {p.value}{isPercent ? '%' : ''}
          </div>
        );
      })}
    </div>
  );
}

export const CHART_HELP_RU = `Диаграммы строятся по выбранным фильтрам (день форума, направление, группа).
• Столбцы «5 зон» — доля ответов на проверки состояния в каждой эмоциональной зоне (на срезе сумма ≈ 100%).
• «11 эмоций» — полный набор как у участника (Радость, Спокойствие, … Сосредоточенность).
• Линии «Зоны по дням» — как меняется каждая зона от дня к дню.
• «Динамика активности» — число ответов и закрытых точек осмысления по дням.
• Наведите курсор на столбец или точку — всплывающая подсказка с цифрами.
• Выгрузки Excel: эмоции и зоны на русском.`;

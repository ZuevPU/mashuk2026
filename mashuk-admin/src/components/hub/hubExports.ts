import { adminDownloadBinary, downloadCsv } from '../../admin/client';

export type HubExportItem = {
  id: string;
  label: string;
  path: string;
  filename: string;
  kind?: 'binary' | 'csv';
};

function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

type HubExportScope = {
  day: string;
  direction?: string;
  group?: string;
  ageCategory?: string;
  activity?: string;
};

function scopeQs(scope: HubExportScope, extra: Record<string, string | number | undefined | null> = {}) {
  return qs({
    mode: 'day',
    day: scope.day,
    direction: scope.direction || undefined,
    group: scope.group || undefined,
    ageCategory: scope.ageCategory || undefined,
    activity: scope.activity || undefined,
    ...extra,
  });
}

/** Полная выгрузка Штаб · Форум за выбранный день фильтра (не вся смена). */
export function forumPackExportItem(scope: HubExportScope): HubExportItem {
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    id: 'forum-pack',
    label: `Пакет за D${scope.day}`,
    path: `/exports/forum-pack${scopeQs(scope)}`,
    filename: `forum_pack_d${scope.day}_${stamp}.xlsx`,
  };
}

export function forumExportItems(scope: HubExportScope | string): HubExportItem[] {
  const s: HubExportScope = typeof scope === 'string' ? { day: scope } : scope;
  const { day } = s;
  return [
    {
      id: 'state',
      label: 'Состояние',
      path: `/exports/state-checks${scopeQs(s)}`,
      filename: `sostoyanie_d${day}.xlsx`,
    },
    {
      id: 'evening',
      label: 'Итоговая анкета',
      path: `/exports/evening-summary${scopeQs(s)}`,
      filename: `itogovaya_anketa_d${day}.xlsx`,
    },
    {
      id: 'after',
      label: 'После блоков',
      path: `/exports/after-blocks${scopeQs(s)}`,
      filename: `posle_blokov_d${day}.xlsx`,
    },
    {
      id: 'piggybank',
      label: 'Копилка',
      path: `/exports/piggybank${qs({
        format: 'xlsx',
        day,
        direction: s.direction || undefined,
        group: s.group || undefined,
        ageCategory: s.ageCategory || undefined,
        activity: s.activity || undefined,
      })}`,
      filename: `kopilka_d${day}.xlsx`,
    },
    {
      id: 'activity',
      label: 'Активность',
      path: `/exports/activity${qs({ format: 'xlsx' })}`,
      filename: 'aktivnost.xlsx',
    },
    {
      id: 'exchange',
      label: 'Обмен опытом',
      path: `/exports/exchange${qs({ format: 'xlsx' })}`,
      filename: 'obmen_opytom.xlsx',
    },
    {
      id: 'day-stats',
      label: 'Статистика дня',
      path: `/exports/day/stats${qs({ day, format: 'xlsx' })}`,
      filename: `statistika_dnya_d${day}.xlsx`,
    },
  ];
}

export function directionExportItems(
  day: string,
  direction: string,
  group?: string,
): HubExportItem[] {
  const dirSafe = direction.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  return [
    {
      id: 'pack',
      label: 'Пакет направления',
      path: `/exports/direction-pack${qs({ mode: 'day', day, direction, group: group || undefined })}`,
      filename: `direction_${dirSafe}_d${day}.xlsx`,
    },
    {
      id: 'evening',
      label: 'Итоговая анкета',
      path: `/exports/evening-summary${qs({ mode: 'day', day, direction, group: group || undefined })}`,
      filename: `evening_${dirSafe}_d${day}.xlsx`,
    },
    {
      id: 'after',
      label: 'После блоков',
      path: `/exports/after-blocks${qs({ mode: 'day', day, direction, group: group || undefined })}`,
      filename: `after_blocks_${dirSafe}_d${day}.xlsx`,
    },
    {
      id: 'state',
      label: 'Состояние',
      path: `/exports/state-checks${qs({ mode: 'day', day, direction, group: group || undefined })}`,
      filename: `state_checks_${dirSafe}_d${day}.xlsx`,
    },
  ];
}

export async function downloadHubExport(item: HubExportItem): Promise<void> {
  const lower = item.filename.toLowerCase();
  if (lower.endsWith('.xlsx') && item.kind === 'csv') {
    throw new Error(`Несогласованная выгрузка: ${item.filename} помечен как csv`);
  }
  if (item.kind === 'csv') {
    await downloadCsv(item.path, item.filename);
    return;
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.pdf') || lower.endsWith('.zip')) {
    await adminDownloadBinary(item.path, item.filename);
    return;
  }
  // Не скачиваем «бинарником» текст под чужим расширением — типичная причина ошибки Excel.
  throw new Error(`Неизвестный тип файла выгрузки: ${item.filename}`);
}

/** Вариант A: последовательно скачивает все файлы линзы. */
export async function downloadAllHubExports(items: HubExportItem[]): Promise<void> {
  for (const item of items) {
    try {
      await downloadHubExport(item);
    } catch {
      /* продолжаем остальные */
    }
  }
}

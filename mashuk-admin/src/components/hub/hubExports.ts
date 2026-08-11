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

/** Полная выгрузка Штаб · Форум за всю смену (все дни) — один XLSX. */
export function forumPackExportItem(): HubExportItem {
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    id: 'forum-pack',
    label: 'Полный пакет форума',
    path: `/exports/forum-pack${qs({ mode: 'shift' })}`,
    filename: `forum_pack_shift_${stamp}.xlsx`,
  };
}

export function forumExportItems(day: string): HubExportItem[] {
  return [
    {
      id: 'state',
      label: 'Состояние',
      path: `/exports/state-checks${qs({ mode: 'day', day })}`,
      filename: `state_checks_d${day}.xlsx`,
    },
    {
      id: 'evening',
      label: 'Итоговая анкета',
      path: `/exports/evening-summary${qs({ mode: 'day', day })}`,
      filename: `evening_d${day}.xlsx`,
    },
    {
      id: 'after',
      label: 'После блоков',
      path: `/exports/after-blocks${qs({ mode: 'day', day })}`,
      filename: `after_blocks_d${day}.xlsx`,
    },
    {
      id: 'piggybank',
      label: 'Копилка',
      path: '/exports/piggybank',
      filename: 'piggybank.xlsx',
    },
    {
      id: 'activity',
      label: 'Активность',
      path: `/exports/activity${qs({ format: 'xlsx' })}`,
      filename: 'activity.xlsx',
    },
    {
      id: 'exchange',
      label: 'Обмен опытом',
      path: `/exports/exchange${qs({ format: 'xlsx' })}`,
      filename: 'exchange.xlsx',
    },
    {
      id: 'day-stats',
      label: 'Статистика дня',
      path: `/exports/day/stats${qs({ day, format: 'xlsx' })}`,
      filename: `day_stats_d${day}.xlsx`,
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
  if (item.kind === 'csv') {
    await downloadCsv(item.path, item.filename);
    return;
  }
  await adminDownloadBinary(item.path, item.filename);
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

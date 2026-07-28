export type ThresholdRow = { level: number; from: number; to: number; name: string };

/** Same as backend normalizeLevelThresholds — uses `from` values. */
export function thresholdRowsToFloors(rows: ThresholdRow[]): number[] {
  if (rows.length === 0) return [0, 100, 250];
  return [...rows.map(r => Number(r.from) || 0)].sort((a, b) => a - b);
}

export function getLevelSync(points: number, floors: number[]): number {
  let level = 1;
  for (let i = 0; i < floors.length; i++) {
    if (points >= floors[i]) level = i + 1;
  }
  return level;
}

export function levelNameForPoints(points: number, rows: ThresholdRow[]): string {
  const floors = thresholdRowsToFloors(rows);
  const level = getLevelSync(points, floors);
  const row = rows.find(r => r.level === level) ?? rows[level - 1];
  return row?.name || `Уровень ${level}`;
}

export type ThresholdValidationIssue = { message: string };

export function validateThresholdRows(rows: ThresholdRow[]): ThresholdValidationIssue[] {
  const issues: ThresholdValidationIssue[] = [];
  const sorted = [...rows].sort((a, b) => a.from - b.from);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.to < r.from) {
      issues.push({ message: `Уровень ${r.level}: «До» (${r.to}) меньше «От» (${r.from})` });
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (r.from <= prev.to) {
        issues.push({
          message: `Пересечение: уровень ${prev.level} (до ${prev.to}) и уровень ${r.level} (от ${r.from})`,
        });
      }
    }
  }
  return issues;
}

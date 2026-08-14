import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { directions, participants } from '../../db/schema.js';
import { matchesAgeCategory, matchesActivity } from '../analytics/cohortFilters.js';
import type { EveningField } from '../eveningQuestionnaireConfig.js';
import { resolveForumWrapConfig } from '../forumWrapQuestionnaire.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import {
  asEveningRatings,
  loadSettingsForEveningExport,
  resolveEveningFilledAt,
  type EveningExportFilters,
  type EveningExportRow,
} from './eveningExportData.js';

function fieldsFromConfig(config: { steps?: Array<{ fields: EveningField[] }> }): EveningField[] {
  const map = new Map<string, EveningField>();
  for (const field of (config.steps || []).flatMap(s => s.fields)) {
    if (!map.has(field.key)) map.set(field.key, field);
  }
  return [...map.values()];
}

export async function collectForumWrapExportRows(
  filters: EveningExportFilters = {},
): Promise<{
  rows: EveningExportRow[];
  fields: EveningField[];
}> {
  const settings = await loadSettingsForEveningExport(filters.shiftId);
  const config = resolveForumWrapConfig(settings as never);
  const fields = fieldsFromConfig(config);
  const shiftId = filters.shiftId ?? (settings as { shiftId?: number }).shiftId;
  if (shiftId == null) return { rows: [], fields };

  const loaded = await db.select({
    p: participants,
    directionName: directions.name,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(
      eq(participants.shiftId, shiftId),
      isNull(participants.selfDeletedAt),
    ));

  const rows: EveningExportRow[] = [];
  for (const row of loaded) {
    const p = row.p;
    if (isOrganizerDirection(row.directionName || p.direction)) continue;
    if (filters.direction && (row.directionName || p.direction) !== filters.direction) continue;
    if (filters.group && (p.groupName || 'без группы') !== filters.group) continue;
    if (filters.ageCategory && !matchesAgeCategory(p.age, filters.ageCategory)) continue;
    if (filters.activityQ && !matchesActivity(p.position, filters.activityQ)) continue;
    if (filters.participantId != null && p.id !== filters.participantId) continue;

    const ratings = asEveningRatings(p.forumWrapRatings);
    const draft = asEveningRatings(p.forumWrapDraft);
    const includeDrafts = filters.includeDrafts !== false;
    if (ratings) {
      rows.push({
        participantId: p.id,
        dayNumber: 1,
        ratings,
        tomorrowRoleKey: null,
        filledAt: resolveEveningFilledAt(ratings, [p.lastActiveAt]),
        p,
        directionName: row.directionName || p.direction,
        source: 'evening_ratings',
        status: 'сдано',
      });
    } else if (includeDrafts && draft) {
      const form = (draft.form && typeof draft.form === 'object' && !Array.isArray(draft.form))
        ? draft.form as Record<string, unknown>
        : draft;
      rows.push({
        participantId: p.id,
        dayNumber: 1,
        ratings: form,
        tomorrowRoleKey: null,
        filledAt: resolveEveningFilledAt(form, [p.lastActiveAt]),
        p,
        directionName: row.directionName || p.direction,
        source: 'draft',
        status: 'черновик',
      });
    }
  }

  const ratingKeys = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.ratings || {})) ratingKeys.add(k);
  }
  const extra: EveningField[] = [];
  for (const key of ratingKeys) {
    if (!key || key === '_submittedAt' || key === 'submittedAt' || fields.some(f => f.key === key)) continue;
    extra.push({ key, type: 'text', label: key });
  }

  return { rows, fields: [...fields, ...extra] };
}

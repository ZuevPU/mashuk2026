import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { markOnboardingCopiedForReview, remapEveningLinkedEvents, remapLinkedIds } from '../services/shiftCopy.js';
import { remapAudienceDirectionTree } from '../services/shiftCatalogs.js';
import { unpublishClonedQuestionnaire } from '../services/eveningQuestionnaireConfig.js';

describe('shift copy id remap', () => {
  it('remaps linked event ids and drops unknown ones', () => {
    const map = new Map<number, number>([[10, 110], [11, 111]]);
    assert.deepEqual(remapLinkedIds([10, 99, '11'], map), [110, 111]);
    assert.deepEqual(remapLinkedIds(null, map), []);
  });

  it('remaps program_event linkedEventIds in evening config and by-day map', () => {
    const map = new Map<number, number>([[5, 50]]);
    const config = {
      steps: [{
        fields: [
          { type: 'program_event', linkedEventIds: [5, 9] },
          { type: 'text', label: 'Комментарий' },
        ],
      }],
    };
    const remapped = remapEveningLinkedEvents(config, map) as typeof config;
    assert.deepEqual(remapped.steps[0].fields[0].linkedEventIds, [50]);

    const byDay = remapEveningLinkedEvents({ '1': config, '2': config }, map) as {
      '1': typeof config;
    };
    assert.deepEqual(byDay['1'].steps[0].fields[0].linkedEventIds, [50]);
  });

  it('remaps audience direction ids in evening config without leaking source ids', () => {
    const map = new Map<number, number>([[3, 30], [4, 40]]);
    const remapped = remapAudienceDirectionTree({
      steps: [{
        fields: [
          { type: 'text', audienceDirectionIds: [3, 99] },
          { type: 'scale', audienceDirectionId: 4 },
        ],
      }],
    }, map) as { steps: Array<{ fields: Array<Record<string, unknown>> }> };
    assert.deepEqual(remapped.steps[0].fields[0].audienceDirectionIds, [30, 99]);
    assert.equal(remapped.steps[0].fields[1].audienceDirectionId, 40);

    const alreadyLocal = remapAudienceDirectionTree({
      steps: [{ fields: [{ audienceDirectionIds: [30, 40] }] }],
    }, map) as { steps: Array<{ fields: Array<{ audienceDirectionIds: number[] }> }> };
    assert.deepEqual(alreadyLocal.steps[0].fields[0].audienceDirectionIds, [30, 40]);
  });

  it('cloned evening questionnaire starts unpublished after remap', () => {
    const map = new Map<number, number>([[5, 50]]);
    const cloned = unpublishClonedQuestionnaire(remapEveningLinkedEvents({
      forcePublished: true,
      forcePublishedAt: 'keep',
      steps: [{ fields: [{ type: 'program_event', linkedEventIds: [5] }] }],
    }, map)) as {
      forcePublished?: boolean;
      forceUnpublished?: boolean;
      steps: Array<{ fields: Array<{ linkedEventIds?: number[] }> }>;
    };
    assert.equal(cloned.forcePublished, undefined);
    assert.equal(cloned.forceUnpublished, true);
    assert.deepEqual(cloned.steps[0].fields[0].linkedEventIds, [50]);
  });

  it('marks copied onboarding as needing review', () => {
    const marked = markOnboardingCopiedForReview({
      interestMin: 1,
      interestMax: 8,
      goalQuestions: [{ text: 'Цель' }],
    });
    assert.equal(marked.needsReview, true);
    assert.equal(marked.interestMax, 8);
    assert.equal(markOnboardingCopiedForReview(null).needsReview, true);
  });
});

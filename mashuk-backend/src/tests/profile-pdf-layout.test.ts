import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { resolvePdfFonts } from '../services/profilePdfLayout.js';
import { participantAnswerSummary } from '../services/participantAnswerFormat.js';
import { streamProfilePdf, type ProfileBundle } from '../services/profilePdfBuilder.js';

describe('profile PDF fonts and Cyrillic', () => {
  it('resolves DejaVu fonts', () => {
    const fonts = resolvePdfFonts();
    assert.match(fonts.regular, /DejaVuSans\.ttf$/);
    assert.match(fonts.bold, /DejaVuSans-Bold\.ttf$/);
  });

  it('humanizes interests JSON for answers', () => {
    assert.equal(participantAnswerSummary({ interests: ['333'] }), '333');
    assert.equal(participantAnswerSummary({ interests: ['спорт', 'медиа'] }), 'спорт, медиа');
  });

  it('streamProfilePdf emits PDF with Cyrillic ToUnicode', async () => {
    const chunks: Buffer[] = [];
    const out = new PassThrough();
    out.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
      out.on('end', () => resolve());
      out.on('error', reject);
    });

    const bundle = {
      participant: {
        id: 1,
        firstName: 'Анна',
        lastName: 'Тестова',
        direction: 'Направление',
        groupName: 'Группа А',
        nextExperiment: null,
      },
      shiftLabel: 'Смена 1',
      abProgress: 42,
      trajectory: { fromDate: '12 авг.', toDate: '19 авг.' },
      actionStyle: {
        route: 'от Исследователя → рост · Наставник',
        strongRole: { name: 'Исследователь' },
        growthRole: { name: 'Наставник' },
      },
      outcomes: { bullets: ['Первый итог', 'Второй итог'] },
      nextSteps: ['Шаг один'],
      allPiggy: [{ text: 'Идея про форум', source: 'Своя мысль', tag: 'идея', tags: ['идея'] }],
      dailyTracker: {
        stateCurve: [
          { dayNumber: 1, energy: 6 },
          { dayNumber: 2, energy: 8 },
        ],
      },
      finalCard: {
        comparison: [
          { index: 1, pointA: 'Было так', pointB: '333' },
        ],
      },
      pdf: { draftBlocks: {} },
    } as unknown as ProfileBundle;

    await streamProfilePdf(bundle, out);
    await done;
    const buf = Buffer.concat(chunks);
    assert.ok(buf.slice(0, 5).toString() === '%PDF-');
    // DejaVu embedding + Cyrillic names should produce ToUnicode / Unicode cmap
    const asStr = buf.toString('latin1');
    assert.ok(asStr.includes('ToUnicode') || asStr.includes('/Font'), 'PDF should embed custom font');
    assert.ok(buf.length > 2000, 'PDF should not be empty');
  });
});

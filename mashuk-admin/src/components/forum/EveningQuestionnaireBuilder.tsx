import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import {
  collectFieldKeys,
  EVENING_FIELD_TYPE_OPTIONS,
  slugKey,
  type EveningField,
  type EveningFieldType,
  type EveningQuestionnaireConfig,
  type EveningStep,
} from './types';
import { EveningQuestionnaireParticipantPreview } from './EveningQuestionnaireParticipantPreview';
import { RichHtmlEditor } from '../admin/RichHtmlEditor';
import { htmlToPlain } from '../admin/RichFormatToolbar';
import {
  buildEveningProgramPickNodes,
  countProgramLeaves,
  flattenProgramEvents,
  type ProgramEventRow,
  type ProgramPickNode,
} from './programEventTree';

type DirectionOpt = { id: number; name: string };

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<unknown>, msg?: string) => void;
  /** Current forum day — so «Снять с публикации» applies to the live day by default. */
  initialDay?: number;
  /** Optional; if omitted, loaded from /directions. */
  directions?: DirectionOpt[];
  /** `forum` — единая итоговая анкета смены, без дней. */
  mode?: 'day' | 'forum';
};

const EMPTY_CONFIG: EveningQuestionnaireConfig = {
  steps: [{ id: 'step_1', title: 'Новый шаг', fields: [] }],
};

function filterConfigForDirectionPreview(
  config: EveningQuestionnaireConfig,
  directionId: number | null,
): EveningQuestionnaireConfig {
  if (directionId == null) return config;
  return {
    ...config,
    steps: config.steps
      .map(step => ({
        ...step,
        fields: step.fields.filter(f => {
          const ids = f.audienceDirectionIds || [];
          if (!ids.length) return true;
          return ids.includes(directionId);
        }),
      }))
      .filter(step => step.fields.length > 0),
  };
}

export function EveningQuestionnaireBuilder({ adminFetch, act, initialDay, directions: directionsProp, mode = 'day' }: Props) {
  const isForum = mode === 'forum';
  const [day, setDay] = useState(() => {
    const d = Number(initialDay);
    return Number.isFinite(d) && d >= 1 && d <= 7 ? d : 1;
  });
  const [config, setConfig] = useState<EveningQuestionnaireConfig>(EMPTY_CONFIG);
  const [opensAtMsk, setOpensAtMsk] = useState('22:00');
  const [forcePublished, setForcePublished] = useState(false);
  const [forceUnpublished, setForceUnpublished] = useState(false);
  const [isOpenNow, setIsOpenNow] = useState(false);
  const [hasOwnConfig, setHasOwnConfig] = useState(true);
  const [scheduleDayPublished, setScheduleDayPublished] = useState<boolean | null>(null);
  const [copyFromDay, setCopyFromDay] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDirectionId, setPreviewDirectionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [programEvents, setProgramEvents] = useState<ProgramEventRow[]>([]);
  const [roles, setRoles] = useState<{ roleKey: string; name: string }[]>([]);
  const [directionsLocal, setDirectionsLocal] = useState<DirectionOpt[]>([]);
  const [defaultConfig, setDefaultConfig] = useState<EveningQuestionnaireConfig | null>(null);
  const directions = directionsProp?.length ? directionsProp : directionsLocal;

  const applyPublishState = (res: {
    opensAtMsk?: string;
    forcePublished?: boolean;
    forceUnpublished?: boolean;
    isOpenNow?: boolean;
    hasOwnConfig?: boolean;
    scheduleDayPublished?: boolean | null;
    config?: EveningQuestionnaireConfig;
  }) => {
    setOpensAtMsk(res.opensAtMsk || opensAtMsk);
    setForcePublished(!!res.forcePublished);
    setForceUnpublished(!!res.forceUnpublished);
    setIsOpenNow(!!res.isOpenNow);
    if (typeof res.hasOwnConfig === 'boolean') setHasOwnConfig(res.hasOwnConfig);
    if (res.scheduleDayPublished !== undefined) setScheduleDayPublished(res.scheduleDayPublished);
    if (res.config?.steps) setConfig(JSON.parse(JSON.stringify(res.config)));
  };

  const loadDay = async (d: number) => {
    setLoading(true);
    try {
      const ev = isForum
        ? await adminFetch('/forum-wrap-questionnaire')
        : await adminFetch(`/evening-questionnaire?day=${d}`);
      const c = ev.config as EveningQuestionnaireConfig;
      const fallback = ev.defaultConfig as EveningQuestionnaireConfig | undefined;
      if (fallback?.steps?.length) setDefaultConfig(JSON.parse(JSON.stringify(fallback)));
      if (c?.steps?.length) setConfig(JSON.parse(JSON.stringify(c)));
      else if (fallback?.steps?.length) setConfig(JSON.parse(JSON.stringify(fallback)));
      else setConfig(JSON.parse(JSON.stringify(EMPTY_CONFIG)));
      setOpensAtMsk(ev.opensAtMsk || c?.opensAtMsk || (isForum ? '10:00' : '22:00'));
      setForcePublished(!!ev.forcePublished);
      setForceUnpublished(!!ev.forceUnpublished);
      setIsOpenNow(!!ev.isOpenNow);
      setHasOwnConfig(ev.hasOwnConfig !== false);
      setScheduleDayPublished(
        ev.scheduleDayPublished === undefined ? null : ev.scheduleDayPublished,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDay(day).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when day changes; forum mode loads once
  }, [isForum ? 0 : day]);

  useEffect(() => {
    adminFetch('/roles')
      .then((res: { roles?: { roleKey: string; name: string; sortOrder?: number | null }[] }) => {
        const list = [...(res.roles || [])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'),
        );
        setRoles(list.map(r => ({ roleKey: r.roleKey, name: r.name })));
      })
      .catch(() => setRoles([]));
  }, [adminFetch]);

  useEffect(() => {
    if (directionsProp?.length) return;
    adminFetch('/directions')
      .then((res: { directions?: DirectionOpt[] }) => {
        const list = [...(res.directions || [])].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        setDirectionsLocal(list.map(d => ({ id: d.id, name: d.name })));
      })
      .catch(() => setDirectionsLocal([]));
  }, [adminFetch, directionsProp]);

  useEffect(() => {
    adminFetch('/events')
      .then((res: { events?: ProgramEventRow[] }) => {
        // /events returns a nested tree — flatten so subtopics keep parentEventId.
        setProgramEvents(flattenProgramEvents(res.events || []));
      })
      .catch(() => setProgramEvents([]));
  }, [adminFetch]);

  const dayProgramTrees = useMemo(
    () => buildEveningProgramPickNodes(programEvents, isForum ? null : day, null),
    [programEvents, day, isForum],
  );

  // Drop linkedEventIds that belong to another day (typical after «copy day» in admin).
  // Wait until this day's program tree is non-empty — otherwise an empty tree
  // would wipe links on a day whose events have not been published yet.
  useEffect(() => {
    if (isForum) return;
    if (programEvents.length === 0) return;
    const dayIds = new Set(dayProgramTrees.map(e => e.id));
    if (dayIds.size === 0) return;
    setConfig(prev => {
      let changed = false;
      const steps = prev.steps.map(step => ({
        ...step,
        fields: step.fields.map(field => {
          if (field.type !== 'program_event' || !field.linkedEventIds?.length) return field;
          const next = field.linkedEventIds.filter(id => dayIds.has(id));
          if (next.length === field.linkedEventIds.length) return field;
          changed = true;
          return { ...field, linkedEventIds: next };
        }),
      }));
      return changed ? { ...prev, steps } : prev;
    });
  }, [day, dayProgramTrees, programEvents.length, isForum]);

  const configPath = () => (isForum ? '/forum-wrap-questionnaire' : `/evening-questionnaire?day=${day}`);

  const updateStep = (index: number, patch: Partial<EveningStep>) => {
    setConfig(prev => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], ...patch };
      return { ...prev, steps };
    });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= config.steps.length) return;
    setConfig(prev => {
      const steps = [...prev.steps];
      [steps[index], steps[j]] = [steps[j], steps[index]];
      return { ...prev, steps };
    });
  };

  const removeStep = (index: number) => {
    if (config.steps.length <= 1) return;
    if (!confirm('Удалить этот шаг анкеты?')) return;
    setConfig(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  };

  const addStep = () => {
    const n = config.steps.length + 1;
    setConfig(prev => ({
      ...prev,
      steps: [...prev.steps, { id: `step_${n}`, title: `Шаг ${n}`, fields: [] }],
    }));
  };

  const updateField = (stepIndex: number, fieldIndex: number, patch: Partial<EveningField>) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const fields = s.fields.map((f, fi) => (fi === fieldIndex ? { ...f, ...patch } : f));
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  /** Set directions on a field and sync to chain dependents (visibleWhen → this field). */
  const setFieldAudienceDirections = (
    stepIndex: number,
    fieldIndex: number,
    nextIds: number[] | undefined,
  ) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const parentKey = s.fields[fieldIndex]?.key;
        const audienceDirectionIds = nextIds?.length ? nextIds : undefined;
        const fields = s.fields.map((f, fi) => {
          if (fi === fieldIndex) return { ...f, audienceDirectionIds };
          if (parentKey && f.visibleWhen?.field === parentKey) {
            return { ...f, audienceDirectionIds };
          }
          return f;
        });
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  const addField = (stepIndex: number) => {
    const keys = collectFieldKeys(config);
    const key = slugKey('new_field', keys);
    const field: EveningField = { key, type: 'text', label: 'Новый вопрос', required: false };
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: [...s.fields, field] } : s,
      );
      return { ...prev, steps };
    });
  };

  const addInfoBlock = (stepIndex: number) => {
    const keys = collectFieldKeys(config);
    const key = slugKey('info_block', keys);
    const field: EveningField = {
      key,
      type: 'info_text',
      label: '',
      required: false,
      html: '',
    };
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: [...s.fields, field] } : s,
      );
      return { ...prev, steps };
    });
  };

  /** Ready-made chain: Да/Нет → события/подтемы с оценкой 1–10 под каждой */
  const addProgramRateChain = (stepIndex: number) => {
    const keys = collectFieldKeys(config);
    const yesKey = slugKey('attended_block', keys);
    const eventKey = slugKey('program_block', keys);
    const chain: EveningField[] = [
      {
        key: yesKey,
        type: 'yes_no',
        label: 'Участвовал(а) в блоке программы сегодня?',
        required: false,
      },
      {
        key: eventKey,
        type: 'program_event',
        label: 'Выберите блоки и темы из программы (можно несколько) и оцените каждую',
        required: true,
        linkedEventIds: [],
        visibleWhen: { field: yesKey, equals: true },
      },
    ];
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: [...s.fields, ...chain] } : s,
      );
      return { ...prev, steps };
    });
  };

  const removeField = (stepIndex: number, fieldIndex: number) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: s.fields.filter((_, fi) => fi !== fieldIndex) } : s,
      );
      return { ...prev, steps };
    });
  };

  const moveField = (stepIndex: number, fieldIndex: number, dir: -1 | 1) => {
    const j = fieldIndex + dir;
    const step = config.steps[stepIndex];
    if (!step || j < 0 || j >= step.fields.length) return;
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const fields = [...s.fields];
        [fields[fieldIndex], fields[j]] = [fields[j], fields[fieldIndex]];
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  const onLabelChange = (stepIndex: number, fieldIndex: number, label: string) => {
    updateField(stepIndex, fieldIndex, { label });
  };

  const save = () => {
    for (const step of config.steps) {
      if (!step.title.trim()) {
        alert('У каждого шага должно быть название.');
        return;
      }
      for (const f of step.fields) {
        if (f.type === 'info_text') {
          if (!htmlToPlain(f.html || '').trim() && !f.label.trim()) {
            alert('У текстового блока должен быть текст.');
            return;
          }
          continue;
        }
        if (!f.label.trim()) {
          alert('У каждого поля должна быть подпись для участника.');
          return;
        }
      }
    }
    act(async () => {
      const {
        forcePublished: _fp,
        forcePublishedAt: _fpa,
        forceUnpublished: _fu,
        ...configBody
      } = config as EveningQuestionnaireConfig & {
        forcePublished?: boolean;
        forcePublishedAt?: string;
        forceUnpublished?: boolean;
      };
      const res = await adminFetch(configPath(), {
        method: 'PATCH',
        body: JSON.stringify({
          config: { ...configBody, opensAtMsk },
          opensAtMsk,
        }),
      });
      applyPublishState(res);
    }, isForum ? 'Итоговая анкета форума сохранена' : `Анкета дня ${day} сохранена`);
  };

  /** publish | schedule | unpublish */
  const setPublishMode = (mode: 'publish' | 'schedule' | 'unpublish') => {
    const forcePublishedNext = mode === 'publish';
    const forceUnpublishedNext = mode === 'unpublish';
    const msg =
      mode === 'publish'
        ? (isForum ? 'Итоговая анкета форума опубликована сейчас' : `Анкета дня ${day} опубликована сейчас`)
        : mode === 'unpublish'
          ? (isForum ? 'Итоговая анкета форума снята с публикации' : `Анкета дня ${day} снята с публикации`)
          : (isForum
            ? `Итоговая анкета форума: публикация по времени ${opensAtMsk} МСК`
            : `Анкета дня ${day}: публикация по времени ${opensAtMsk} МСК`);
    act(async () => {
      const res = await adminFetch(configPath(), {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            ...config,
            opensAtMsk,
            forcePublished: forcePublishedNext || undefined,
            forceUnpublished: forceUnpublishedNext || undefined,
          },
          opensAtMsk,
          forcePublished: forcePublishedNext,
          forceUnpublished: forceUnpublishedNext,
        }),
      });
      applyPublishState(res);
    }, msg);
  };

  const conditionParentsInStep = (step: EveningStep, fieldKey: string) =>
    step.fields.filter(f =>
      f.key !== fieldKey && (f.type === 'yes_no' || f.type === 'choice' || f.type === 'program_event'),
    );

  const fieldTypeOptions = EVENING_FIELD_TYPE_OPTIONS.filter(o => o.value !== 'point_b_cta');

  const renderSubtopicLines = (nodes: ProgramPickNode[], depth = 0): ReactNode => (
    nodes.map(n => (
      <div key={n.id}>
        <div style={{ marginLeft: 12 + depth * 14, fontSize: 12, color: '#555', padding: '2px 0' }}>
          · {n.title}
          {n.children.length > 0 ? (
            <span style={{ color: '#888' }}> · {countProgramLeaves(n.children)} тем</span>
          ) : (
            <span style={{ color: '#aaa' }}> ›</span>
          )}
        </div>
        {n.children.length > 0 && renderSubtopicLines(n.children, depth + 1)}
      </div>
    ))
  );

  return (
    <div className="adm-forum-block">
      <div className="adm-kb-panel-head">
        <h3>{isForum ? 'Итоговая анкета форума' : 'Итоговая анкета вечера'}</h3>
        <p className="adm-kb-panel-sub">
          {isForum
            ? 'Одна анкета на всю смену. Участники заполняют её на главной после публикации.'
            : 'Конструктор шагов и полей вечерней анкеты. Вопросы для дашборда «Итоги форума» отмечайте чекбоксом «Итоговый вопрос форума».'
        </p>
      </div>
      <p className="adm-forum-hint">
        {isForum
          ? 'Не путать с вечерней анкетой дня и с Точкой Б. Тип «Событие / тема из программы» может брать блоки всех дней смены.'
          : 'Участники заполняют эту анкету вечером на главной (дни 1–7). Точка Б — отдельный вопрос в последний день смены (день 8), в эту анкету не входит. Поле «Эксперимент с ролью» лучше выносить в отдельный шаг — на главной оно показывается отдельным блоком с текстом эксперимента дня. Тип «Событие / тема из программы» берёт блоки дня из раздела «Программа»; можно ограничить список галочками и собрать цепочку «Да → событие → оценка».'}
      </p>
      {!isForum && (
      <div className="adm-seg adm-forum-day-seg">
        {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
          <button key={d} type="button" className={day === d ? 'on' : ''} onClick={() => setDay(d)}>
            День {d}
          </button>
        ))}
      </div>
      )}
      {loading && <p className="adm-muted">Загрузка…</p>}
      {!loading && hasOwnConfig === false && (
        <p className="adm-forum-hint">
          {isForum
            ? 'Ещё нет сохранённой анкеты форума — показан шаблон. «Сохранить анкету» или публикация запишет конфиг смены.'
            : `Для дня ${day} ещё нет своей сохранённой анкеты — показан шаблон. «Сохранить анкету» или публикация запишет копию именно на этот день.`}
        </p>
      )}

      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label className="adm-forum-inline">
          Открыть с (МСК)
          <input
            type="time"
            className="adm-input"
            style={{ width: 120 }}
            value={opensAtMsk}
            onChange={e => setOpensAtMsk(e.target.value)}
          />
        </label>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          {forceUnpublished
            ? 'Снята с публикации — участники не видят анкету.'
            : scheduleDayPublished === false
              ? 'День скрыт в программе — участники не видят анкету, пока день не опубликуют.'
              : forcePublished
                ? 'Открыта вручную («Опубликовать сейчас»).'
                : isOpenNow
                  ? `Сейчас открыта по расписанию (≥ ${opensAtMsk} МСК).`
                  : `Появится автоматически в ${opensAtMsk} МСК.`}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => setPublishMode('schedule')}
          title="Сохранить время и убрать ручные флаги публикации"
        >
          Опубликовать во время
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          onClick={() => setPublishMode('publish')}
          disabled={forcePublished && isOpenNow}
        >
          Опубликовать сейчас
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-danger adm-btn-sm"
          onClick={() => setPublishMode('unpublish')}
          disabled={forceUnpublished}
        >
          Снять с публикации
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          title="Рассылка в ЛС сообщества VK и уведомление мини-приложения: анкета доступна"
          onClick={() => {
            if (!confirm(
              isForum
                ? 'Оповестить участников смены, что итоговая анкета форума доступна?\n\n'
                  + 'Сообщение уйдёт через VK (сообщество + мини-приложение). '
                  + 'Тем, кто уже сдал анкету, письмо не отправим.'
                : `Оповестить участников смены, что итоговая анкета дня ${day} доступна?\n\n`
                  + 'Сообщение уйдёт через VK (сообщество + мини-приложение). '
                  + 'Тем, кто уже сдал анкету за этот день, письмо не отправим.',
            )) return;
            act(async () => {
              const res = await adminFetch(
                isForum ? '/forum-wrap-questionnaire/notify' : `/evening-questionnaire/notify?day=${day}`,
                {
                  method: 'POST',
                  body: JSON.stringify({}),
                },
              ) as {
                sentTo?: number;
                audience?: number;
                skippedCompleted?: number;
              };
              const sent = res.sentTo ?? 0;
              const skipped = res.skippedCompleted ?? 0;
              return skipped > 0
                ? `Оповещение отправлено: ${sent} · уже сдали, пропущено: ${skipped}`
                : `Оповещение отправлено: ${sent}`;
            }, 'Оповещение отправлено');
          }}
        >
          Оповестить
        </button>
      </div>

      <div className="adm-forum-toolbar">
        {!isForum && (
          <>
        <label className="adm-forum-inline">
          Скопировать настройки с дня
          <select value={copyFromDay} onChange={e => setCopyFromDay(Number(e.target.value))}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          disabled={copyFromDay === day}
          onClick={() => {
            if (copyFromDay === day) {
              alert('Выберите другой день — копировать день сам в себя нельзя.');
              return;
            }
            act(async () => {
              await adminFetch('/evening-questionnaire/copy', {
                method: 'POST',
                body: JSON.stringify({ fromDay: copyFromDay, toDay: day }),
              });
              await loadDay(day);
            }, 'Скопировано');
          }}
        >
          Копировать
        </button>
          </>
        )}
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => {
            if (!confirm(isForum
              ? 'Сбросить итоговую анкету форума к заводским настройкам?'
              : `Сбросить анкету дня ${day} к заводским настройкам?`)) return;
            act(async () => {
              if (isForum) {
                const fallback = defaultConfig || { steps: [{ id: 'step_1', title: 'Новый шаг', fields: [] }] };
                const res = await adminFetch('/forum-wrap-questionnaire', {
                  method: 'PATCH',
                  body: JSON.stringify({ config: fallback, opensAtMsk: fallback.opensAtMsk || '10:00' }),
                });
                applyPublishState(res);
              } else {
                await adminFetch(`/evening-questionnaire/reset?day=${day}`, { method: 'POST' });
                await loadDay(day);
              }
            }, 'Сброшено');
          }}
        >
          Заводские настройки
        </button>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setPreviewOpen(v => !v)}>
          {previewOpen ? 'Скрыть предпросмотр' : 'Предпросмотр'}
        </button>
        {!isForum && (
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          title="Список участников (вопросы столбцами) + отдельный лист на каждый вопрос"
          onClick={() => act(
            () => adminDownloadBinary(
              `/exports/evening-summary?day=${day}`,
              `evening_summary_d${day}.xlsx`,
            ),
            'Файл скачан',
          )}
        >
          Скачать ответы за день форума D{day}
        </button>
        )}
        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={save}>
          Сохранить анкету
        </button>
      </div>
      {previewOpen && (
        <>
          {directions.length > 0 && (
            <label className="adm-forum-check" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              Превью как направление
              <select
                className="adm-input adm-input-narrow"
                style={{ width: 'auto', minWidth: 160 }}
                value={previewDirectionId ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  setPreviewDirectionId(v ? Number(v) : null);
                }}
              >
                <option value="">Для всех (полный конфиг)</option>
                {directions.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          <EveningQuestionnaireParticipantPreview
            day={isForum ? null : day}
            config={filterConfigForDirectionPreview(config, previewDirectionId)}
            programEvents={programEvents}
            roles={roles}
          />
        </>
      )}
      {config.steps.map((step, stepIndex) => (
        <div key={`${step.id}-${stepIndex}`} className="adm-forum-step-card">
          <div className="adm-forum-step-head">
            <input
              className="adm-input adm-forum-step-title"
              value={step.title}
              onChange={e => updateStep(stepIndex, { title: e.target.value })}
              placeholder="Название шага (видит участник)"
            />
            <div className="adm-forum-step-actions">
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveStep(stepIndex, -1)} title="Выше">↑</button>
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveStep(stepIndex, 1)} title="Ниже">↓</button>
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => removeStep(stepIndex)}>Удалить шаг</button>
            </div>
          </div>
          {step.fields.map((field, fieldIndex) => (
            <div key={field.key} className="adm-forum-field-row">
              {field.type !== 'info_text' && (
              <input
                className="adm-input"
                value={field.label}
                onChange={e => onLabelChange(stepIndex, fieldIndex, e.target.value)}
                placeholder="Текст вопроса для участника"
              />
              )}
              {field.type === 'info_text' && (
                <div className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Текстовый блок</div>
              )}
              <select
                className="adm-input"
                value={field.type}
                onChange={e => {
                  const type = e.target.value as EveningFieldType;
                  const patch: Partial<EveningField> = { type };
                  if (type === 'choice' && !(field.options?.length)) {
                    patch.options = ['Вариант 1', 'Вариант 2'];
                  }
                  if (type !== 'choice') {
                    patch.options = undefined;
                    patch.allowOther = undefined;
                    patch.otherLabel = undefined;
                  }
                  if (type === 'program_event' && !field.linkedEventIds) {
                    patch.linkedEventIds = [];
                  }
                  if (type !== 'program_event') {
                    patch.linkedEventIds = undefined;
                  }
                  if (type === 'info_text') {
                    patch.required = false;
                    patch.html = field.html || (field.label.trim()
                      ? `<p>${field.label
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')}</p>`
                      : '');
                  } else {
                    patch.html = undefined;
                    if (field.type === 'info_text') {
                      const plain = htmlToPlain(field.html || '');
                      if (plain && !field.label.trim()) patch.label = plain;
                    }
                  }
                  updateField(stepIndex, fieldIndex, patch);
                }}
              >
                {fieldTypeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {field.type !== 'info_text' && (
              <label className="adm-forum-check">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={e => updateField(stepIndex, fieldIndex, { required: e.target.checked })}
                />
                Обязательное
              </label>
              )}
              {field.type !== 'info_text' && !isForum && (
              <label className="adm-forum-check" title="Ответы попадут на дашборд «Итоги форума»">
                <input
                  type="checkbox"
                  checked={!!field.forumFinal}
                  onChange={e => updateField(stepIndex, fieldIndex, { forumFinal: e.target.checked || undefined })}
                />
                Итоговый вопрос форума
              </label>
              )}
              {conditionParentsInStep(step, field.key).length > 0 && (
                <label className="adm-forum-check">
                  <input
                    type="checkbox"
                    checked={!!field.visibleWhen}
                    onChange={e => {
                      if (!e.target.checked) {
                        updateField(stepIndex, fieldIndex, { visibleWhen: undefined });
                        return;
                      }
                      const dep = conditionParentsInStep(step, field.key)[0];
                      if (!dep) return;
                      const equals = dep.type === 'yes_no'
                        ? true
                        : dep.type === 'program_event'
                          ? '__set__'
                          : (dep.options?.filter(Boolean)[0] || '');
                      updateField(stepIndex, fieldIndex, { visibleWhen: { field: dep.key, equals } });
                    }}
                  />
                  Условие
                </label>
              )}
              {field.visibleWhen && (() => {
                const parents = conditionParentsInStep(step, field.key);
                const parent = parents.find(f => f.key === field.visibleWhen!.field) || parents[0];
                return (
                  <>
                    <select
                      className="adm-input adm-input-narrow"
                      value={field.visibleWhen.field}
                      onChange={e => {
                        const dep = parents.find(f => f.key === e.target.value);
                        const equals = dep?.type === 'yes_no'
                          ? true
                          : dep?.type === 'program_event'
                            ? '__set__'
                            : (dep?.options?.filter(Boolean)[0] || '');
                        updateField(stepIndex, fieldIndex, {
                          visibleWhen: { field: e.target.value, equals },
                        });
                      }}
                    >
                      {parents.map(f => (
                        <option key={f.key} value={f.key}>{f.label.slice(0, 40)}</option>
                      ))}
                    </select>
                    <select
                      className="adm-input adm-input-narrow"
                      value={String(field.visibleWhen.equals)}
                      onChange={e => {
                        const raw = e.target.value;
                        let equals: boolean | string = raw;
                        if (raw === 'true') equals = true;
                        else if (raw === 'false') equals = false;
                        updateField(stepIndex, fieldIndex, {
                          visibleWhen: { field: field.visibleWhen!.field, equals },
                        });
                      }}
                    >
                      {parent?.type === 'yes_no' ? (
                        <>
                          <option value="true">= Да</option>
                          <option value="false">= Нет</option>
                        </>
                      ) : parent?.type === 'program_event' ? (
                        <option value="__set__">= событие выбрано</option>
                      ) : (
                        <>
                          {(parent?.options || []).filter(Boolean).map(opt => (
                            <option key={opt} value={opt}>= {opt}</option>
                          ))}
                          {parent?.allowOther && (
                            <option value="__other__">= {parent.otherLabel || 'Свой вариант'}</option>
                          )}
                        </>
                      )}
                    </select>
                  </>
                );
              })()}
              <div className="adm-forum-field-actions">
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveField(stepIndex, fieldIndex, -1)}>↑</button>
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveField(stepIndex, fieldIndex, 1)}>↓</button>
                <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => removeField(stepIndex, fieldIndex)}>×</button>
              </div>
              {field.type === 'info_text' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <RichHtmlEditor
                    label="Текст для участника"
                    value={field.html || ''}
                    resetKey={field.key}
                    minHeight={88}
                    onChange={html => updateField(stepIndex, fieldIndex, {
                      html,
                      label: htmlToPlain(html),
                    })}
                  />
                  <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    Участник видит этот текст как перебивку между вопросами — без поля ответа.
                  </p>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                <div className="adm-label">Направления</div>
                <p className="adm-muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
                  По умолчанию — для всех. Можно отметить одно или несколько направлений.
                  У цепочки настройки с родителя копируются на зависимые вопросы.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                  <label className="adm-forum-check" style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!field.audienceDirectionIds?.length}
                      onChange={() => setFieldAudienceDirections(stepIndex, fieldIndex, undefined)}
                    />
                    Для всех
                  </label>
                  {directions.map(d => {
                    const selected = field.audienceDirectionIds || [];
                    const checked = selected.includes(d.id);
                    return (
                      <label key={d.id} className="adm-forum-check" style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? selected.filter(id => id !== d.id)
                              : [...selected, d.id];
                            setFieldAudienceDirections(
                              stepIndex,
                              fieldIndex,
                              next.length ? next : undefined,
                            );
                          }}
                        />
                        {d.name}
                      </label>
                    );
                  })}
                  {directions.length === 0 && (
                    <span className="adm-muted" style={{ fontSize: 12 }}>Направления ещё не загружены</span>
                  )}
                </div>
              </div>
              {field.type === 'role_select' && (
                <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                  <div className="adm-label">Варианты ролей</div>
                  <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                    Подставляются из раздела «Роли» (как при регистрации). Редактировать названия —
                    там же.
                  </p>
                  {roles.length === 0 ? (
                    <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Роли ещё не загружены или список пуст.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {roles.map(r => (
                        <li key={r.roleKey}>{r.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {field.type === 'choice' && (
                <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                  <div className="adm-label">Варианты ответа</div>
                  {(field.options || []).map((opt, oi) => (
                    <div key={oi} className="adm-forum-diag-row" style={{ marginTop: 4 }}>
                      <input
                        className="adm-input"
                        value={opt}
                        onChange={e => {
                          const options = [...(field.options || [])];
                          options[oi] = e.target.value;
                          updateField(stepIndex, fieldIndex, { options });
                        }}
                      />
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={(field.options || []).length <= 2}
                        onClick={() => updateField(stepIndex, fieldIndex, {
                          options: (field.options || []).filter((_, idx) => idx !== oi),
                        })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => updateField(stepIndex, fieldIndex, {
                      options: [...(field.options || []), `Вариант ${(field.options || []).length + 1}`],
                    })}
                  >
                    + Вариант
                  </button>
                  <label className="adm-forum-check" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!field.allowOther}
                      onChange={e => updateField(stepIndex, fieldIndex, {
                        allowOther: e.target.checked,
                        otherLabel: e.target.checked ? (field.otherLabel || 'Свой вариант') : undefined,
                      })}
                    />
                    Свой вариант (текст)
                  </label>
                </div>
              )}
              {field.type === 'program_event' && (
                <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                  <div className="adm-label">Связь с программой дня {day}</div>
                  <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                    Отметьте крупные блоки дня {day}. Участник видит только отмеченные
                    (блок → подтемы → оценка 1–10). Если ничего не отмечено — все блоки этого дня.
                    Связи с других дней (после копирования анкеты) не показываются участнику.
                  </p>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxHeight: 280,
                    overflowY: 'auto',
                    padding: 10,
                    background: '#f9f9f9',
                    borderRadius: 8,
                    border: '1px solid #eee',
                  }}>
                    {dayProgramTrees.map(ev => {
                      const linked = field.linkedEventIds || [];
                      const checked = linked.includes(ev.id);
                      const leafCount = countProgramLeaves(ev.children);
                      return (
                        <div key={ev.id} style={{ borderBottom: '1px solid #eee', paddingBottom: 6 }}>
                          <label className="adm-forum-check" style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? linked.filter(id => id !== ev.id)
                                  : [...linked, ev.id];
                                updateField(stepIndex, fieldIndex, { linkedEventIds: next });
                              }}
                            />
                            {ev.title}
                            {leafCount > 0 && (
                              <span style={{ fontWeight: 500, color: '#666' }}>· {leafCount} подтем</span>
                            )}
                          </label>
                          {ev.children.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              {renderSubtopicLines(ev.children)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayProgramTrees.length === 0 && (
                      <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
                        Нет событий программы на день {day}. Добавьте крупный блок и подтемы во вкладке «Программа».
                      </p>
                    )}
                  </div>
                  {(field.linkedEventIds?.length || 0) > 0 && (
                    <p className="adm-muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Выбрано крупных блоков: {field.linkedEventIds!.length}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => addField(stepIndex)}>
              + Добавить вопрос
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => addInfoBlock(stepIndex)}
              title="Текст-перебивка между вопросами: цвет, размер, жирный, курсив, подчёркивание"
            >
              + Текстовый блок
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => addProgramRateChain(stepIndex)}
              title="Да/нет → несколько тем из программы, оценка 1–10 под каждой"
            >
              + Цепочка: Да → темы + оценки
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-secondary" onClick={addStep} style={{ marginTop: 12 }}>
        + Добавить шаг
      </button>
    </div>
  );
}

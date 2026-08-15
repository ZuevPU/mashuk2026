import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDelete } from '../../admin/confirmDelete';
import { ADMIN_SHIFT_CHANGED_EVENT, adminDownloadBinary, getAdminEditingShiftId } from '../../admin/client';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import { AnswerConfirmationSettings, type AnswerConfirmForm } from './AnswerConfirmationSettings';
import { ExchangeLimitsSettings, type ExchangeLimitsForm } from './ExchangeLimitsSettings';
import { ExchangeAdminPanel } from './ExchangeAdminPanel';
import { OrgDirectorPanel } from './OrgDirectorPanel';
import { QuestionAnswersModal } from './QuestionAnswersModal';
import { QuestionForm } from './QuestionForm';
import { QuestionParticipantPreview } from './QuestionParticipantPreview';
import { QuestionsListTable } from './QuestionsListTable';
import { PracticesResultsModal } from './PracticesResultsModal';
import {
  KIND_TABS,
  type AdminQuestion,
  type QuestionDraft,
  type QuestionKindTab,
  buildListQuery,
  bodyFromDraft,
  draftFromQuestion,
  emptyDraft,
  fromLocalInputMsk,
  type QuestionPersistMode,
} from './types';
import { ROLE_OPTIONS } from '../onboarding/roleOptions';

const QUESTIONS_LIST_NAV: HubNavItem[] = [
  { id: 'q-hero', label: 'Обзор' },
  { id: 'q-content', label: 'Контент' },
];

const QUESTIONS_TOOLS_NAV: HubNavItem[] = [
  { id: 'q-hero', label: 'Обзор' },
  { id: 'q-tools', label: 'Инструменты' },
];

const QUESTIONS_CONFIRM_NAV: HubNavItem[] = [
  { id: 'q-hero', label: 'Обзор' },
  { id: 'q-confirm', label: 'Подтверждение' },
];

type QuestionsTabProps = AdminTabProps & {
  onOpenCard?: (id: number) => void;
  focusKind?: string | null;
  focusNonce?: number;
};

export function QuestionsTab({
  adminFetch,
  act,
  reloadKey,
  setTab,
  onOpenCard,
  onOpenBlock,
  focusKind,
  focusNonce,
}: QuestionsTabProps) {
  const [loading, setLoading] = useState(true);
  const [totalAll, setTotalAll] = useState(0);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [totalDays, setTotalDays] = useState(8);
  const [forumDay, setForumDay] = useState(1);
  const [shiftLabel, setShiftLabel] = useState<string>('');

  const [kindTab, setKindTab] = useState<QuestionKindTab>('all');
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [view, setView] = useState<'list' | 'form' | 'confirm' | 'tools'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<QuestionDraft>(() => emptyDraft(1));
  const [showPreview, setShowPreview] = useState(false);
  const [formTab, setFormTab] = useState<'main' | 'versions' | 'tagcloud'>('main');
  const [versions, setVersions] = useState<{ id: number; title: string; status?: string; createdAt?: string }[]>([]);
  const [versionNotice, setVersionNotice] = useState<string | null>(null);
  const [answerCount, setAnswerCount] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTargetDay, setBulkTargetDay] = useState(2);
  const [copyDayForm, setCopyDayForm] = useState({ fromDay: 1, toDay: 2, overwrite: false });

  const [branchParentOptions, setBranchParentOptions] = useState<Record<number, { label: string; value: string }[]>>({});

  const [answersModal, setAnswersModal] = useState<{ open: boolean; title: string; loading: boolean; rows: any[] }>({
    open: false, title: '', loading: false, rows: [],
  });
  const [notifyModal, setNotifyModal] = useState<{ q: AdminQuestion; text: string } | null>(null);
  const notifySendingRef = useRef(false);

  const [answerConfirmForm, setAnswerConfirmForm] = useState<AnswerConfirmForm>({
    enabled: true,
    showPoints: true,
    titleTemplate: 'Ответ отправлен',
  });
  const [exchangeLimitsForm, setExchangeLimitsForm] = useState<ExchangeLimitsForm>({
    maxQuestionsTotal: 3,
    pointsPerQuestion: 3,
    maxAnswersForPoints: 5,
    pointsPerAnswer: 5,
  });

  const [directions, setDirections] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [participants, setParticipants] = useState<{ id: number; firstName?: string | null; lastName?: string | null; direction?: string | null }[]>([]);
  const [practicesResultsId, setPracticesResultsId] = useState<number | null>(null);
  const [practicesResultsTitle, setPracticesResultsTitle] = useState('');

  useEffect(() => {
    if (!focusKind || !focusNonce) return;
    if (KIND_TABS.some(t => t.key === focusKind)) {
      setKindTab(focusKind as QuestionKindTab);
      setView('list');
    }
  }, [focusKind, focusNonce]);

  const readOnly = kindTab === 'exchange' || kindTab === 'org_director';

  const listQuery = useMemo(
    () => buildListQuery({
      kindTab,
      q: search,
      day: dayFilter,
      audienceType: audienceFilter,
      status: statusFilter,
    }),
    [kindTab, search, dayFilter, audienceFilter, statusFilter],
  );

  const loadMeta = useCallback(async () => {
    const fs = (await adminFetch('/forum-settings')).settings;
    const td = fs?.totalDays ?? 8;
    const cd = fs?.currentDay ?? 1;
    setTotalDays(td);
    setForumDay(cd);
    if (fs?.answerConfirmation) {
      const ac = fs.answerConfirmation as AnswerConfirmForm;
      setAnswerConfirmForm({
        enabled: ac.enabled !== false,
        showPoints: ac.showPoints !== false,
        titleTemplate: ac.titleTemplate || 'Ответ отправлен',
      });
    }
    if (fs?.exchangeLimits && typeof fs.exchangeLimits === 'object') {
      const el = fs.exchangeLimits as Partial<ExchangeLimitsForm> & { maxAnswersPerDay?: number };
      const answersForPoints = el.maxAnswersForPoints ?? el.maxAnswersPerDay;
      setExchangeLimitsForm({
        maxQuestionsTotal: Number.isFinite(Number(el.maxQuestionsTotal)) ? Math.max(0, Math.floor(Number(el.maxQuestionsTotal))) : 3,
        pointsPerQuestion: Number.isFinite(Number(el.pointsPerQuestion)) ? Math.max(0, Math.floor(Number(el.pointsPerQuestion))) : 3,
        maxAnswersForPoints: Number.isFinite(Number(answersForPoints)) ? Math.max(0, Math.floor(Number(answersForPoints))) : 5,
        pointsPerAnswer: Number.isFinite(Number(el.pointsPerAnswer)) ? Math.max(0, Math.floor(Number(el.pointsPerAnswer))) : 5,
      });
    }
    const allRes = await adminFetch('/questions');
    setTotalAll(allRes.totalCount ?? allRes.questions?.length ?? 0);
    const [dirRes, grpRes, shiftsRes, evRes, partRes] = await Promise.all([
      adminFetch('/directions').catch(() => ({ directions: [] })),
      adminFetch('/participants/groups').catch(() => ({ groups: [] })),
      adminFetch('/shifts').catch(() => ({ shifts: [] })),
      adminFetch('/events').catch(() => ({ events: [] })),
      adminFetch('/participants?limit=2000').catch(() => ({ participants: [] })),
    ]);
    const list = Array.isArray(partRes.participants) ? partRes.participants : [];
    setParticipants(list.map((p: any) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      direction: p.direction || null,
    })));
    setDirections(dirRes.directions || []);
    setGroups(grpRes.groups || []);
    setAllEvents(evRes.events || []);
    const shifts = (shiftsRes.shifts || []) as { id: number; name: string; code?: string }[];
    const sid = getAdminEditingShiftId();
    const current = sid != null ? shifts.find(s => s.id === sid) : shifts[0];
    setShiftLabel(current ? (current.name || current.code || `Смена #${current.id}`) : '');
    return { td, cd };
  }, [adminFetch]);

  const loadQuestions = useCallback(async () => {
    const res = await adminFetch(`/questions?${listQuery}`);
    setQuestions(res.questions || []);
    if (res.totalCount != null && kindTab !== 'exchange' && kindTab !== 'org_director') {
      setTotalAll(res.totalCount);
    }
  }, [adminFetch, listQuery, kindTab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadMeta();
      await loadQuestions();
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadQuestions]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  useEffect(() => {
    const onShiftChanged = () => {
      setDayFilter('');
      setSelectedIds(new Set());
    };
    window.addEventListener(ADMIN_SHIFT_CHANGED_EVENT, onShiftChanged);
    return () => window.removeEventListener(ADMIN_SHIFT_CHANGED_EVENT, onShiftChanged);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [kindTab, listQuery]);

  useEffect(() => {
    if (view !== 'form') return;
    const parents = questions.filter(q =>
      q.id !== editingId
      && (q.answerType === 'choice' || q.answerType === 'multi' || q.type === 'choice' || q.type === 'multi'),
    );
    let cancelled = false;
    Promise.all(parents.map(async (p) => {
      try {
        const res = await adminFetch(`/questions/${p.id}/options`);
        const opts = (res.options || []).map((o: { label?: string; value?: string }) => ({
          label: o.label || o.value || '',
          value: o.value || o.label || '',
        }));
        return [p.id, opts] as const;
      } catch {
        return [p.id, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setBranchParentOptions(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [view, questions, editingId, adminFetch]);

  const reloadParticipants = useCallback(async () => {
    try {
      const partRes = await adminFetch('/participants?limit=2000');
      const list = Array.isArray(partRes.participants) ? partRes.participants : [];
      setParticipants(list.map((p: any) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        direction: p.direction || null,
      })));
    } catch {
      /* keep previous list */
    }
  }, [adminFetch]);

  const openCreate = async () => {
    const meta = await loadMeta();
    const day = dayFilter ? Number(dayFilter) : meta.cd;
    setEditingId(null);
    setDraft(emptyDraft(day));
    setVersionNotice(null);
    setAnswerCount(0);
    setVersions([]);
    setFormTab('main');
    setShowPreview(false);
    setView('form');
  };

  const openEdit = async (q: AdminQuestion) => {
    setEditingId(q.id);
    setVersionNotice(null);
    setFormTab('main');
    setShowPreview(false);
    setView('form');
    void reloadParticipants();
    const detail = await adminFetch(`/questions/${q.id}`);
    setDraft(draftFromQuestion(detail.question, detail.options || []));
    setAnswerCount(detail.question?.answerCount ?? q.answerCount ?? 0);
    const ver = await adminFetch(`/questions/${q.id}/versions`);
    setVersions(ver.versions || []);
  };

  useEffect(() => {
    if (view === 'form' && draft.questionKind === 'practices_vote') {
      void reloadParticipants();
    }
  }, [view, draft.questionKind, reloadParticipants]);

  const persistOptions = async (questionId: number, options: QuestionDraft['options']) => {
    const existing = (await adminFetch(`/questions/${questionId}/options`)).options || [];
    for (const ex of existing) {
      await adminFetch(`/questions/${questionId}/options/${ex.id}`, { method: 'DELETE' });
    }
    const ids: number[] = [];
    for (const o of options) {
      if (!o.label.trim()) continue;
      const r = await adminFetch(`/questions/${questionId}/options`, {
        method: 'POST',
        body: JSON.stringify({ label: o.label, value: o.value || o.label }),
      });
      if (r.option?.id) ids.push(r.option.id);
    }
    if (ids.length) {
      await adminFetch(`/questions/${questionId}/options/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ optionIds: ids }),
      });
    }
  };

  const persist = (mode: QuestionPersistMode) => {
    if (!draft.title.trim()) {
      alert('Укажите заголовок вопроса.');
      return;
    }
    const isPractices = draft.questionKind === 'practices_vote' || draft.answerType === 'practices_vote';
    if (isPractices) {
      const titled = draft.practicesConfig.practices.filter(p => p.title.trim());
      if (titled.length === 0) {
        alert('Добавьте хотя бы одну практику с названием — иначе участникам не за что голосовать.');
        return;
      }
    }
    if (draft.audienceType === 'direction' && !draft.audienceDirectionId) {
      alert('Выберите направление: вопрос будет виден только участникам этого направления.');
      return;
    }
    if (mode === 'schedule' && !draft.publishTime) {
      alert('Укажите время открытия, чтобы опубликовать по расписанию.');
      return;
    }
    if (mode === 'now' || mode === 'schedule') {
      const closeIso = fromLocalInputMsk(draft.closeTime);
      if (closeIso && new Date(closeIso).getTime() <= Date.now()) {
        alert('Время закрытия уже прошло — вопрос сразу исчезнет у участников. Сдвиньте закрытие.');
        return;
      }
    }
    act(async () => {
      const body = bodyFromDraft(draft, mode);
      let qid = editingId;
      let res: { question?: AdminQuestion; versioned?: boolean; previousAnswerCount?: number };
      if (editingId) {
        res = await adminFetch(`/questions/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
        qid = res.question?.id ?? editingId;
      } else {
        res = await adminFetch('/questions', { method: 'POST', body: JSON.stringify(body) });
        qid = res.question?.id ?? null;
        if (res.question) {
          setEditingId(res.question.id);
          setDraft(draftFromQuestion(res.question, draft.options.map((o, i) => ({ id: i, label: o.label, value: o.value }))));
        }
      }
      if (qid && ['choice', 'multi', 'dependent'].includes(draft.answerType)) {
        await persistOptions(qid, draft.options);
      }
      if (res.versioned) {
        setVersionNotice(`⚠ Уже собрано ${res.previousAnswerCount} ответов на прежнюю формулировку. Старые ответы сохранили прежний текст в снэпшоте.`);
        if (res.question) setEditingId(res.question.id);
      }
      await loadQuestions();
      if (mode === 'now' || mode === 'schedule') {
        setView('list');
        setEditingId(null);
      } else if (res.question) {
        setDraft(d => ({ ...d, status: res.question?.status || d.status }));
      }
    }, mode === 'now' ? 'Опубликовано сейчас' : mode === 'schedule' ? 'Опубликовано по времени' : 'Сохранено');
  };

  const duplicateQuestion = (id: number) =>
    act(async () => {
      const r = await adminFetch(`/questions/${id}/duplicate`, { method: 'POST', body: '{}' });
      await loadQuestions();
      if (r.question) openEdit(r.question);
    }, 'Копия создана');

  const copyToDay = (id: number) => {
    const dayStr = prompt('Скопировать на день (1–8):', String(forumDay + 1));
    if (!dayStr) return;
    const targetDay = Number(dayStr);
    if (!targetDay || targetDay < 1 || targetDay > 8) return;
    act(async () => {
      await adminFetch(`/questions/${id}/copy-to-day`, {
        method: 'POST',
        body: JSON.stringify({ targetDay }),
      });
      await loadQuestions();
    }, 'Скопировано на день');
  };

  const unpublishQuestion = (id: number) => {
    act(async () => {
      await adminFetch(`/questions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'draft' }),
      });
      if (editingId === id) setDraft(d => ({ ...d, status: 'draft' }));
      await loadQuestions();
    }, 'Снято с публикации');
  };

  const hideQuestion = (id: number) => {
    const q = questions.find(x => x.id === id);
    const nextHidden = !q?.isHidden;
    act(async () => {
      await adminFetch(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify({ isHidden: nextHidden }) });
      await loadQuestions();
    }, nextHidden ? 'Скрыто' : 'Отображается');
  };

  const deleteQuestion = (id: number) => {
    if (!confirmDelete('Удалить вопрос?')) return;
    act(async () => {
      await adminFetch(`/questions/${id}`, { method: 'DELETE' });
      await loadQuestions();
    }, 'Удалено');
  };

  const viewAnswers = (q: AdminQuestion) => {
    setAnswersModal({ open: true, title: q.title, loading: true, rows: [] });
    adminFetch(`/questions/${q.id}/answers?limit=50`)
      .then(r => setAnswersModal(m => ({ ...m, loading: false, rows: r.answers || [] })))
      .catch(() => setAnswersModal(m => ({ ...m, loading: false, rows: [] })));
  };

  const openNotify = (q: AdminQuestion) => {
    setNotifyModal({ q, text: '' });
  };

  const sendNotify = () => {
    if (!notifyModal || notifySendingRef.current) return;
    const { q, text } = notifyModal;
    const trimmed = text.trim();
    if (!trimmed) {
      alert('Введите текст сообщения для участников');
      return;
    }
    notifySendingRef.current = true;
    setNotifyModal(null);
    act(async () => {
      try {
        const res = await adminFetch(`/questions/${q.id}/notify`, {
          method: 'POST',
          body: JSON.stringify({ text: trimmed }),
        });
        return typeof res?.message === 'string' && res.message
          ? res.message
          : 'Рассылка удалась';
      } finally {
        notifySendingRef.current = false;
      }
    }, 'Рассылка удалась');
  };

  const bulkCopy = () => {
    if (selectedIds.size === 0) return;
    act(async () => {
      await adminFetch('/questions/copy-selected', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds], targetDay: bulkTargetDay }),
      });
      setSelectedIds(new Set());
      await loadQuestions();
    }, 'Скопировано');
  };

  const bulkAction = (action: 'publish' | 'hide' | 'unhide' | 'draft' | 'delete') => {
    if (selectedIds.size === 0) return;
    if (action === 'delete' && !confirmDelete('Удалить выбранные вопросы?')) return;

    act(async () => {
      await adminFetch('/questions/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds], action }),
      });
      setSelectedIds(new Set());
      await loadQuestions();
    }, 'Действие выполнено');
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (questions.every(q => selectedIds.has(q.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map(q => q.id)));
    }
  };

  if (loading && view === 'list') {
    return <p className="adm-muted">Загрузка вопросов…</p>;
  }

  return (
    <HubLensLayout
      className="adm-forum adm-kb"
      items={
        view === 'tools' ? QUESTIONS_TOOLS_NAV
          : view === 'confirm' ? QUESTIONS_CONFIRM_NAV
            : QUESTIONS_LIST_NAV
      }
      navLabel="Разделы вопросов"
    >
      <section id="q-hero" className="adm-forum-anchor">
      <AdminPageHero
        title={`Вопросы · ${questions.length} в списке · ${totalAll} всего`}
        hint={
          shiftLabel
            ? `Смена «${shiftLabel}» (выбор сверху в шапке). Показаны только вопросы этой смены; ниже можно открыть день.`
            : 'Выберите смену в шапке сверху — вопросы разделены по сменам. Обмен и дирекция — просмотр и модерация.'
        }
      />
      </section>

      {view === 'confirm' && (
        <section id="q-confirm" className="adm-forum-anchor">
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" style={{ marginBottom: 8 }} onClick={() => setView('list')}>← К списку</button>
          <AnswerConfirmationSettings
            form={answerConfirmForm}
            onChange={patch => setAnswerConfirmForm(f => ({ ...f, ...patch }))}
            onSave={() => act(() => adminFetch('/forum-settings', {
              method: 'PATCH',
              body: JSON.stringify({ answerConfirmation: answerConfirmForm }),
            }), 'Сохранено')}
          />
        </section>
      )}

      {view === 'tools' && (
        <section id="q-tools" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" style={{ marginBottom: 8 }} onClick={() => setView('list')}>← К списку</button>
          <div className="adm-kb-panel-head">
            <h3>Инструменты</h3>
            <p className="adm-kb-panel-sub">
              Шаблоны точек осмысления, копирование дня и пересчёт баллов / окон.
            </p>
          </div>
          <p className="adm-muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>
            Здесь копируются <strong>7 точек осмысления / проверки состояния</strong> в разделе «Общение».
            Большая <strong>итоговая анкета вечера</strong> (оценки 1–5, выводы, роль на завтра) настраивается отдельно:
            вкладка «Форум» → блок «Итоговая анкета вечера» (время открытия МСК и кнопка «Опубликовать»).
            Слот «Итоговая анкета по дню» в списке вопросов — одно короткое
            текстовое поле-напоминание; основная форма открывается на главной по времени или сразу после публикации.
          </p>
          <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="adm-btn"
              onClick={() => act(() => adminFetch('/questions/seed-touchpoints', {
                method: 'POST', body: JSON.stringify({ overwrite: false }),
              }), 'Шаблон развёрнут')}
            >
              Развернуть шаблон 7×7
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              onClick={() => {
                const ok = window.confirm(
                  'Пересчитать баллы по всем ответам на вопросы?\n\n'
                  + 'У кого баллы уже есть — ничего не меняем.\n'
                  + 'У кого ответ есть, а баллов не было — начислим в Путь.',
                );
                if (!ok) return;
                act(async () => {
                  const res = await adminFetch('/questions/backfill-points', { method: 'POST', body: '{}' });
                  const awarded = res?.newlyAwarded ?? 0;
                  const linked = res?.linkedExisting ?? 0;
                  const okCount = res?.alreadyOk ?? 0;
                  const pts = res?.pointsTotal ?? 0;
                  const people = res?.participantsAffected ?? 0;
                  return `Готово: начислено ${awarded} (+${pts} Путь), привязано ${linked}, уже ок ${okCount}, участников ${people}`;
                });
              }}
            >
              Пересчитать баллы
            </button>
          </div>
          <p className="adm-muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
            «Пересчитать баллы» проверяет все ответы: если участник прошёл точку осмысления / проверку состояния,
            но баллы не записались — доначисляет. Повторно тем, у кого уже учтено, не начисляет.
          </p>
          <div className="form-row">
            <span>Скопировать день</span>
            <input type="number" className="adm-input" style={{ width: 70 }} value={copyDayForm.fromDay} onChange={e => setCopyDayForm({ ...copyDayForm, fromDay: Number(e.target.value) })} />
            <span>→</span>
            <input type="number" className="adm-input" style={{ width: 70 }} value={copyDayForm.toDay} onChange={e => setCopyDayForm({ ...copyDayForm, toDay: Number(e.target.value) })} />
            <label className="adm-forum-check">
              <input type="checkbox" checked={copyDayForm.overwrite} onChange={e => setCopyDayForm({ ...copyDayForm, overwrite: e.target.checked })} />
              Заменить существующие на целевом дне
            </label>
            <button
              type="button"
              className="adm-btn"
              onClick={() => act(() => adminFetch('/questions/copy-day', {
                method: 'POST', body: JSON.stringify(copyDayForm),
              }).then(() => loadQuestions()), 'Скопировано (вопросы + анкета вечера на «Форуме», если дни 1–7)')}
            >
              Скопировать
            </button>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              onClick={() => act(async () => {
                const res = await adminFetch('/questions/realign-touchpoint-windows', {
                  method: 'POST',
                  body: JSON.stringify({}),
                }) as { updated?: number; note?: string };
                await loadQuestions();
                return res?.note || `Обновлено окон: ${res?.updated ?? 0}`;
              }, 'Окна точек пересчитаны')}
            >
              Пересчитать окна точек
            </button>
            <span className="adm-muted" style={{ fontSize: 12 }}>
              По startDate смены (если окна съехали — D3 было пустым при живых итогах дня)
            </span>
          </div>
        </div>
        </section>
      )}

      {view === 'form' && (
        <QuestionForm
          draft={draft}
          totalDays={totalDays}
          isNew={!editingId}
          currentQuestionId={editingId}
          answerCount={answerCount}
          versionNotice={versionNotice}
          formTab={formTab}
          versions={versions}
          adminFetch={adminFetch}
          onFormTab={setFormTab}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          onSaveDraft={() => persist('draft')}
          onPublish={() => persist('schedule')}
          onPublishNow={() => persist('now')}
          onUnpublish={() => {
            if (!editingId) return;
            unpublishQuestion(editingId);
          }}
          onRevokePoints={() => {
            if (!editingId) return;
            const ok = window.confirm(
              `Аннулировать баллы всем, кто ответил на вопрос «${draft.title || editingId}»?\n\n`
              + 'Снимутся ВСЕ начисления этого типа у ответивших (включая повторные накрутки). Ответы сохранятся.',
            );
            if (!ok) return;
            act(async () => {
              const res = await adminFetch(`/questions/${editingId}/revoke-points`, {
                method: 'POST',
                body: JSON.stringify({
                  reason: `Аннулирование баллов за вопрос #${editingId}`,
                }),
              });
              const n = res?.participantsAffected ?? 0;
              const pts = res?.pointsRevoked ?? 0;
              const logs = res?.revokedLogs ?? 0;
              const unmatched = res?.unmatchedAnswers ?? 0;
              if (logs === 0) {
                return unmatched > 0
                  ? `Не найдено начислений для снятия (ответов: ${res?.answersCount ?? 0}, без лога: ${unmatched})`
                  : 'Начислений по этому вопросу не найдено';
              }
              return `Снято: ${pts} б. у ${n} уч. (${logs} записей)`
                + (unmatched > 0 ? `, без лога: ${unmatched}` : '');
            });
          }}
          onViewPracticesResults={() => {
            if (!editingId) return;
            setPracticesResultsId(editingId);
            setPracticesResultsTitle(draft.title || 'Практики');
          }}
          onCancel={() => { setView('list'); setEditingId(null); }}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(v => !v)}
          onReorderOption={(from, to) => {
            setDraft(d => {
              const options = [...d.options];
              const [item] = options.splice(from, 1);
              options.splice(to, 0, item);
              return { ...d, options };
            });
          }}
          onAddOption={() => setDraft(d => ({ ...d, options: [...d.options, { label: '', value: '' }] }))}
          onRemoveOption={i => setDraft(d => ({ ...d, options: d.options.filter((_, idx) => idx !== i) }))}
          branchParents={questions
            .filter(q =>
              q.id !== editingId
              && (q.answerType === 'choice' || q.answerType === 'multi' || q.type === 'choice' || q.type === 'multi'),
            )
            .map(q => ({
              id: q.id,
              title: q.title,
              options: branchParentOptions[q.id] || [],
            }))}
          previewSlot={<QuestionParticipantPreview draft={draft} programEvents={allEvents} />}
          directions={directions}
          groups={groups}
          roleOptions={ROLE_OPTIONS}
          participants={participants}
          programEvents={allEvents}
        />
      )}

      {view === 'list' && (
        <section id="q-content" className="adm-forum-anchor">
          <div className="adm-kb-toolbar" style={{ marginBottom: 8 }}>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setView('confirm')}>Подтверждение ответа</button>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setView('tools')}>Инструменты</button>
            {kindTab !== 'exchange' && kindTab !== 'org_director' && (
              <button
                type="button"
                className="adm-btn adm-btn-primary adm-btn-sm"
                title="Общий список ответов + отдельный лист на каждый вопрос (участник, направление, ответ)"
                onClick={() => {
                  const day = dayFilter || String(forumDay);
                  const sp = new URLSearchParams({ day });
                  if (kindTab !== 'all') sp.set('questionKind', kindTab);
                  act(
                    () => adminDownloadBinary(
                      `/exports/questions-day?${sp.toString()}`,
                      `questions_day${day}.xlsx`,
                    ),
                    'Файл скачан',
                  );
                }}
              >
                Выгрузить ответы за день {dayFilter || forumDay}
              </button>
            )}
            {kindTab === 'org_director' && (
              <button
                type="button"
                className="adm-btn adm-btn-primary adm-btn-sm"
                onClick={() => act(
                  () => adminDownloadBinary('/exports/org-director', 'org_director.xlsx'),
                  'Файл скачан',
                )}
              >
                Выгрузить обращения
              </button>
            )}
            {kindTab === 'exchange' && (
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() => act(
                  () => adminDownloadBinary('/exports/exchange?format=csv', 'exchange.csv'),
                  'Файл скачан',
                )}
              >
                Выгрузить обмен
              </button>
            )}
            {!readOnly && (
              <button type="button" className="adm-btn" style={{ marginLeft: 'auto' }} onClick={openCreate}>+ Создать вопрос</button>
            )}
            {kindTab === 'exchange' && setTab && (
              <button type="button" className="adm-btn" style={{ marginLeft: 'auto' }} onClick={() => setTab('moderation')}>Модерация</button>
            )}
          </div>

          <div className="adm-forum-seg" style={{ marginBottom: 12 }}>
            {KIND_TABS.map(t => (
              <button key={t.key} type="button" className={kindTab === t.key ? 'on' : ''} onClick={() => setKindTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {kindTab === 'exchange' && (
            <ExchangeLimitsSettings
              form={exchangeLimitsForm}
              onChange={patch => setExchangeLimitsForm(f => ({ ...f, ...patch }))}
              onSave={() => act(() => adminFetch('/forum-settings', {
                method: 'PATCH',
                body: JSON.stringify({ exchangeLimits: exchangeLimitsForm }),
              }), 'Лимиты обмена сохранены')}
              onOpenLevels={onOpenBlock ? () => onOpenBlock({ tab: 'levels', anchor: 'levels-actions' }) : (setTab ? () => setTab('levels') : undefined)}
            />
          )}

          {kindTab === 'exchange' ? (
            <>
              <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <input
                  className="adm-input"
                  placeholder="Поиск по тексту или участнику"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ minWidth: 220 }}
                />
              </div>
              <ExchangeAdminPanel
                adminFetch={adminFetch}
                act={act}
                reloadKey={reloadKey}
                search={search}
                onOpenModeration={setTab ? () => setTab('moderation') : undefined}
                onOpenCard={onOpenCard}
              />
            </>
          ) : kindTab === 'org_director' ? (
            <>
              <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <input
                  className="adm-input"
                  placeholder="Поиск по вопросу, участнику, теме"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ minWidth: 260 }}
                />
              </div>
              <OrgDirectorPanel
                adminFetch={adminFetch}
                act={act}
                reloadKey={reloadKey}
                search={search}
                onOpenCard={onOpenCard}
              />
            </>
          ) : (
            <>
              <div className="adm-seg" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <button type="button" className={!dayFilter ? 'on' : ''} onClick={() => setDayFilter('')}>
                  Все дни
                </button>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
                  <button
                    key={d}
                    type="button"
                    className={dayFilter === String(d) ? 'on' : ''}
                    onClick={() => setDayFilter(String(d))}
                  >
                    День {d}
                  </button>
                ))}
              </div>

              <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <input
                  className="adm-input"
                  placeholder="Поиск"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ minWidth: 160 }}
                />
                <select className="adm-input" value={audienceFilter} onChange={e => setAudienceFilter(e.target.value)}>
                  <option value="">Аудитория: все</option>
                  <option value="all">Все</option>
                  <option value="direction">Направление</option>
                  <option value="group">Группа</option>
                  <option value="role">Роль</option>
                </select>
                <select className="adm-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">Статус: все</option>
                  <option value="published">Опубликован</option>
                  <option value="draft">Черновик</option>
                </select>
              </div>

              {!readOnly && (
                <div className="form-row card" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span>Скопировать день</span>
                  <input
                    type="number"
                    className="adm-input"
                    style={{ width: 70 }}
                    min={1}
                    max={8}
                    value={copyDayForm.fromDay}
                    onChange={e => setCopyDayForm({ ...copyDayForm, fromDay: Number(e.target.value) })}
                  />
                  <span>→</span>
                  <input
                    type="number"
                    className="adm-input"
                    style={{ width: 70 }}
                    min={1}
                    max={8}
                    value={copyDayForm.toDay}
                    onChange={e => setCopyDayForm({ ...copyDayForm, toDay: Number(e.target.value) })}
                  />
                  <label className="adm-forum-check">
                    <input
                      type="checkbox"
                      checked={copyDayForm.overwrite}
                      onChange={e => setCopyDayForm({ ...copyDayForm, overwrite: e.target.checked })}
                    />
                    Заменить на целевом дне
                  </label>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => act(() => adminFetch('/questions/copy-day', {
                      method: 'POST',
                      body: JSON.stringify(copyDayForm),
                    }).then(() => loadQuestions()), 'Скопировано (вопросы + анкета вечера на «Форуме», если дни 1–7)')}
                  >
                    Скопировать
                  </button>
                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setView('tools')}>
                    Ещё инструменты…
                  </button>
                </div>
              )}

              {!readOnly && selectedIds.size > 0 && (
                <div className="adm-kb-bulk" style={{ marginBottom: 12 }}>
                  <span className="adm-kb-bulk-count">Выбрано: {selectedIds.size}</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => bulkAction('publish')}>Опубликовать</button>
                    <button type="button" className="adm-btn adm-btn-secondary adm-btn-xs" onClick={() => bulkAction('hide')}>Скрыть</button>
                    <button type="button" className="adm-btn adm-btn-secondary adm-btn-xs" onClick={() => bulkAction('unhide')}>Показать</button>
                    <button type="button" className="adm-btn adm-btn-secondary adm-btn-xs" onClick={() => bulkAction('draft')}>В черновики</button>
                    <button type="button" className="adm-btn btn-danger adm-btn-xs" onClick={() => bulkAction('delete')}>Удалить</button>
                  </div>
                  <div style={{ width: '100%', height: 1, background: '#e0dad0', margin: '4px 0' }} />
                  <span>→ день</span>
                  <input type="number" className="adm-input" style={{ width: 64 }} min={1} max={8} value={bulkTargetDay} onChange={e => setBulkTargetDay(Number(e.target.value))} />
                  <button type="button" className="adm-btn adm-btn-sm" onClick={bulkCopy}>Скопировать выбранные</button>
                </div>
              )}

              <QuestionsListTable
                questions={questions}
                selectedIds={selectedIds}
                readOnly={readOnly}
                groupByDay={!dayFilter && !readOnly}
                directionList={directions}
                groupList={groups}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onEdit={openEdit}
                onDuplicate={duplicateQuestion}
                onViewAnswers={viewAnswers}
                onNotify={openNotify}
                onViewPracticesResults={(q) => {
                  setPracticesResultsId(q.id);
                  setPracticesResultsTitle(q.title);
                }}
                onCopyToDay={copyToDay}
                onHide={hideQuestion}
                onUnpublish={unpublishQuestion}
                onDelete={deleteQuestion}
                onOpenModeration={setTab ? () => setTab('moderation') : undefined}
              />
            </>
          )}
        </section>
      )}

      {notifyModal && (
        <div className="adm-modal-backdrop" onClick={() => setNotifyModal(null)}>
          <div className="card" style={{ maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Оповестить участников</h3>
            <p className="adm-muted" style={{ fontSize: 13, marginTop: 0 }}>
              Вопрос: <strong>{notifyModal.q.title}</strong>
              <br />
              Участникам уйдёт ровно ваш текст + ссылка на этот вопрос в мини-приложении.
            </p>
            <label className="adm-field">
              <span className="adm-label">Текст сообщения</span>
              <textarea
                className="adm-input"
                rows={5}
                value={notifyModal.text}
                onChange={e => setNotifyModal(m => (m ? { ...m, text: e.target.value } : m))}
                placeholder="Напишите сообщение, которое получат участники"
              />
            </label>
            <div className="form-row" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn adm-btn-primary" onClick={sendNotify}>
                Отправить
              </button>
              <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setNotifyModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <QuestionAnswersModal
        questionTitle={answersModal.title}
        open={answersModal.open}
        loading={answersModal.loading}
        answers={answersModal.rows}
        onClose={() => setAnswersModal(m => ({ ...m, open: false }))}
      />

      {practicesResultsId != null && (
        <PracticesResultsModal
          questionId={practicesResultsId}
          title={practicesResultsTitle}
          adminFetch={adminFetch}
          act={act}
          onClose={() => setPracticesResultsId(null)}
        />
      )}
    </HubLensLayout>
  );
}

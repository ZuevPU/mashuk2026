import { useEffect, useState } from 'react';
import {
  Panel, PanelHeader, PanelHeaderBack, Group, FormItem, Textarea, Button, Slider, Snackbar,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost } from '../api/client';

type SurveyQuestion = {
  key: string;
  label: string;
  type: 'scale' | 'text' | 'nps';
  min?: number;
  max?: number;
};

type PendingSurvey = {
  id: number;
  questions: SurveyQuestion[];
};

export function DelayedSurveyPanel({ id }: { id: string }) {
  const routeNavigator = useRouteNavigator();
  const [survey, setSurvey] = useState<PendingSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ survey: PendingSurvey | null }>('/delayed-survey/pending')
      .then(res => setSurvey(res.survey))
      .catch(() => setSurvey(null))
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (!survey) return;
    setSaving(true);
    try {
      await apiPost(`/delayed-survey/${survey.id}/respond`, { answers });
      setToast('Спасибо! Ответы сохранены.');
      setTimeout(() => routeNavigator.push('/'), 1200);
    } catch {
      setToast('Не удалось отправить. Попробуйте позже.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>
        Опрос после форума
      </PanelHeader>
      <Group>
        {loading && <p style={{ padding: 16 }}>Загрузка…</p>}
        {!loading && !survey && (
          <p style={{ padding: 16 }}>Сейчас нет активного опроса.</p>
        )}
        {survey?.questions.map(q => (
          <FormItem key={q.key} top={q.label}>
            {q.type === 'text' ? (
              <Textarea
                value={String(answers[q.key] ?? '')}
                onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))}
              />
            ) : (
              <Slider
                min={q.min ?? 1}
                max={q.max ?? 5}
                step={1}
                value={Number(answers[q.key] ?? q.min ?? 1)}
                onChange={v => setAnswers(a => ({ ...a, [q.key]: v }))}
              />
            )}
          </FormItem>
        ))}
        {survey && (
          <FormItem>
            <Button size="l" stretched loading={saving} onClick={submit}>
              Отправить
            </Button>
          </FormItem>
        )}
      </Group>
      {toast && (
        <Snackbar onClose={() => setToast(null)} onClosed={() => setToast(null)}>{toast}</Snackbar>
      )}
    </Panel>
  );
}

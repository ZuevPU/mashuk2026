import { useEffect, useState } from 'react';
import { Spinner, Button, Div } from '@vkontakte/vkui';
import { apiGet, ApiError } from '../../api/client';
import {
  EveningQuestionnaire,
  type EveningQuestionnaireProps,
} from '../home/EveningQuestionnaire';

type HomeEveningPayload = {
  currentDay: number;
  experiment?: EveningQuestionnaireProps['experiment'];
  eveningQuestionnaire: {
    available: boolean;
    opensAt?: string | null;
    completed: boolean;
  } & EveningQuestionnaireProps['questionnaire'];
};

type Props = {
  onClose: () => void;
  onSubmitted: () => void;
};

/** Loads the multi-step evening survey instead of the single open stub. */
export function EveningDaySummaryFlow({ onClose, onSubmitted }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState<HomeEveningPayload | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<HomeEveningPayload>('/home')
      .then(setHome)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить анкету');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Div style={{ padding: 24, textAlign: 'center' }}>
        <Spinner size="l" />
      </Div>
    );
  }

  if (error || !home) {
    return (
      <Div style={{ padding: 16 }}>
        <div style={{ color: '#C53030', marginBottom: 12 }}>{error || 'Нет данных'}</div>
        <Button onClick={load}>Повторить</Button>
      </Div>
    );
  }

  const eq = home.eveningQuestionnaire;
  if (!eq?.available) {
    return (
      <Div style={{ padding: 16, fontSize: 13, lineHeight: 1.45 }}>
        {eq?.completed
          ? 'Вы уже заполнили итоговую анкету за сегодня.'
          : `Итоговая анкета откроется в ${eq?.opensAt || '22:00'} МСК. Это серия вопросов на главной — не одно поле.`}
        <Button size="l" stretched style={{ marginTop: 14 }} onClick={onClose}>
          Закрыть
        </Button>
      </Div>
    );
  }

  return (
    <EveningQuestionnaire
      currentDay={eq.dayNumber ?? home.currentDay}
      questionnaire={eq}
      experiment={home.experiment}
      onClose={onClose}
      onSubmitted={onSubmitted}
    />
  );
}

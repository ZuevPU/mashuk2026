import React, { useState, useEffect } from 'react';
import { Panel, PanelHeader, Group, FormItem, CustomSelect, Button, Div, Cell, Snackbar } from '@vkontakte/vkui';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { apiGet, apiPost } from '../api/client';

interface RegistrationPanelProps {
  id: string;
  fetchedUser: UserInfo | null;
  isRegistered: boolean;
  onRegistered?: () => void;
}

interface Direction {
  id: number;
  name: string;
}

const DEV_FIRST_NAME = 'Тест';
const DEV_LAST_NAME = 'Пользователь';

export const RegistrationPanel: React.FC<RegistrationPanelProps> = ({ id, fetchedUser, isRegistered, onRegistered }) => {
  const routeNavigator = useRouteNavigator();
  const [step, setStep] = useState(0);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [directionId, setDirectionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = fetchedUser?.first_name || DEV_FIRST_NAME;
  const lastName = fetchedUser?.last_name || DEV_LAST_NAME;

  useEffect(() => {
    if (isRegistered) {
      routeNavigator.replace('/');
    }
  }, [isRegistered, routeNavigator]);

  useEffect(() => {
    apiGet<{ directions: Direction[] }>('/directions')
      .then(data => setDirections(data.directions))
      .catch(() => setError('Не удалось загрузить направления'));
  }, []);

  const selectedDirection = directions.find(d => d.id === directionId);

  const handleConfirm = async () => {
    if (!directionId || isRegistered) return;
    setLoading(true);
    setError(null);
    try {
      await apiPost('/auth/register', { firstName, lastName, directionId });
      onRegistered?.();
      routeNavigator.replace('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка регистрации';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader>Регистрация</PanelHeader>
      <Group>
        {step === 0 && (
          <>
            <div className="m-card m-reg-welcome">
              <div style={{ fontSize: 28, marginBottom: 12 }}>🏔</div>
              <h2>Добро пожаловать на форум «Машук 2026»</h2>
              <p>
                Для участия нужно один раз указать направление и подтвердить данные из профиля ВКонтакте.
              </p>
            </div>
            <Button size="l" stretched onClick={() => setStep(1)}>
              Начать регистрацию
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <Div>Данные из вашего профиля ВКонтакте:</Div>
            <Cell subtitle="Имя">{firstName}</Cell>
            <Cell subtitle="Фамилия">{lastName}</Cell>
            <FormItem top="Направление">
              <CustomSelect
                placeholder="Выберите направление"
                options={directions.map(d => ({ label: d.name, value: d.id }))}
                value={directionId ?? undefined}
                onChange={(e) => setDirectionId(Number(e.target.value))}
              />
            </FormItem>
            <Button size="l" stretched disabled={!directionId} onClick={() => setStep(2)}>
              Далее
            </Button>
            <Button size="l" stretched mode="secondary" onClick={() => setStep(0)} style={{ marginTop: 8 }}>
              Назад
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <Div>Подтвердите данные перед сохранением:</Div>
            <Cell subtitle="Имя">{firstName}</Cell>
            <Cell subtitle="Фамилия">{lastName}</Cell>
            <Cell subtitle="Направление">{selectedDirection?.name}</Cell>
            <FormItem>
              <Button size="l" stretched loading={loading} onClick={handleConfirm}>
                Подтвердить и войти
              </Button>
            </FormItem>
            <Button size="l" stretched mode="secondary" onClick={() => setStep(1)}>
              Назад
            </Button>
          </>
        )}
      </Group>

      {error && (
        <Snackbar onClose={() => setError(null)} onClosed={() => setError(null)}>
          {error}
        </Snackbar>
      )}
    </Panel>
  );
};

import type { AdminTabProps } from '../admin/types';
import { OrgDirectorPanel } from '../questions/OrgDirectorPanel';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act' | 'reloadKey'> & {
  onOpenCard?: (id: number) => void;
};

export function OrgThreadsSection({ adminFetch, act, reloadKey, onOpenCard }: Props) {
  return (
    <div className="card adm-forum-block">
      <h3>Обращения к организаторам / дирекции</h3>
      <p className="adm-forum-hint">Все обращения в таблице: ответ с уведомлением, удаление, сортировка и карточка по клику на вопрос.</p>
      <OrgDirectorPanel
        adminFetch={adminFetch}
        act={act}
        reloadKey={reloadKey}
        onOpenCard={onOpenCard}
      />
    </div>
  );
}

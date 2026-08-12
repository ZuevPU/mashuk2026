import type { AdminTabProps } from '../admin/types';
import { OrgDirectorPanel } from '../questions/OrgDirectorPanel';

type Props = Pick<AdminTabProps, 'adminFetch' | 'act' | 'reloadKey'> & {
  onOpenCard?: (id: number) => void;
};

export function OrgThreadsSection({ adminFetch, act, reloadKey, onOpenCard }: Props) {
  return (
    <div className="card adm-forum-block adm-kb-panel">
      <div className="adm-kb-panel-head">
        <h3>Обращения к организаторам / дирекции</h3>
        <p className="adm-kb-panel-sub">
          Все обращения в таблице: ответ с уведомлением, удаление, сортировка и карточка по клику на вопрос.
        </p>
      </div>
      <OrgDirectorPanel
        adminFetch={adminFetch}
        act={act}
        reloadKey={reloadKey}
        onOpenCard={onOpenCard}
      />
    </div>
  );
}

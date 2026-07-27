import { roleName } from './roleOptions';

type Props = {
  title: string;
  body: string;
  roleKey: string;
};

export function AdviceParticipantPreview({ title, body, roleKey }: Props) {
  const name = roleName(roleKey);
  return (
    <div className="card adm-advice-preview">
      <div className="adm-forum-preview-label">Как на главной · Совет дня</div>
      <div className="adm-advice-preview-card">
        <div className="adm-advice-preview-kicker">Совет дня</div>
        <div className="adm-advice-preview-title">{title || 'Заголовок совета'}</div>
        {name && (
          <div className="adm-advice-preview-role">
            Развиваю сегодня · <strong>◆ {name}</strong>
          </div>
        )}
        <p className="adm-advice-preview-body">{body || 'Текст совета…'}</p>
      </div>
    </div>
  );
}

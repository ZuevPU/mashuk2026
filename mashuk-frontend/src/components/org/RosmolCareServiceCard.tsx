import { useState } from 'react';

const CARE_LOGO_URL = 'https://events.myrosmol.ru/upload/sz.svg';
const CARE_EMAIL = 'zabota@myrosmol.ru';
const CARE_PHONE_TOLL_FREE = '8 (800) 222-44-89';
const CARE_PHONE_TOLL_FREE_HREF = 'tel:+78002224489';
const CARE_PHONE_MOSCOW = '+7 (495) 159-22-24';
const CARE_PHONE_MOSCOW_HREF = 'tel:+74951592224';

/** Collapsed by default — secondary to writing forum organizers. */
export function RosmolCareServiceCard() {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <details className="m-rosmol-care m-rosmol-care--collapsible">
      <summary className="m-rosmol-care-toggle">
        {!logoFailed && (
          <img
            className="m-rosmol-care-logo m-rosmol-care-logo--sm"
            src={CARE_LOGO_URL}
            alt=""
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        )}
        <span className="m-rosmol-care-toggle-text">
          <span className="m-rosmol-care-toggle-title">Служба заботы Росмолодёжи</span>
          <span className="m-rosmol-care-toggle-hint">Если вопрос вне форума «Машук»</span>
        </span>
      </summary>

      <div className="m-rosmol-care-panel">
        <p className="m-rosmol-care-lead">
          Если ваш вопрос выходит за рамки форума «Машук» или вы не нашли нужную информацию,
          вы всегда можете обратиться в Службу заботы Росмолодёжи. Здесь помогут с вопросами
          участия в проектах и мероприятиях Росмолодёжи, а также подскажут, куда обратиться
          в вашей ситуации.
        </p>

        <div className="m-rosmol-care-contacts">
          <a className="m-rosmol-contact" href={`mailto:${CARE_EMAIL}`}>
            <span className="m-rosmol-contact-label">Почта</span>
            <span className="m-rosmol-contact-value">{CARE_EMAIL}</span>
          </a>
          <a className="m-rosmol-contact" href={CARE_PHONE_TOLL_FREE_HREF}>
            <span className="m-rosmol-contact-label">Телефон · по России</span>
            <span className="m-rosmol-contact-value">{CARE_PHONE_TOLL_FREE}</span>
          </a>
          <a className="m-rosmol-contact" href={CARE_PHONE_MOSCOW_HREF}>
            <span className="m-rosmol-contact-label">Телефон · Москва</span>
            <span className="m-rosmol-contact-value">{CARE_PHONE_MOSCOW}</span>
          </a>
        </div>

        <div className="m-rosmol-care-details-body">
          <p>
            Служба заботы Росмолодёжи — это единый контур поддержки и коммуникации с молодёжью,
            осуществляющий координацию с профильными ведомствами и организациями для оперативного
            реагирования.
          </p>
          <p>
            Мы готовы помочь молодым людям разобраться в разных жизненных ситуациях: на работе,
            в учёбе, в отношениях, в поиске себя и в моменты, когда нужна психологическая поддержка.
          </p>
        </div>
      </div>
    </details>
  );
}

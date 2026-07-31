import { useState } from 'react';

const CARE_LOGO_URL = 'https://events.myrosmol.ru/upload/sz.svg';
const CARE_EMAIL = 'zabota@myrosmol.ru';
const CARE_PHONE_TOLL_FREE = '8 (800) 222-44-89';
const CARE_PHONE_TOLL_FREE_HREF = 'tel:+78002224489';
const CARE_PHONE_MOSCOW = '+7 (495) 159-22-24';
const CARE_PHONE_MOSCOW_HREF = 'tel:+74951592224';

export function RosmolCareServiceCard() {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <section className="m-rosmol-care" aria-label="Служба заботы Росмолодёжи">
      <div className="m-rosmol-care-head">
        {!logoFailed && (
          <img
            className="m-rosmol-care-logo"
            src={CARE_LOGO_URL}
            alt="Служба заботы Росмолодёжи"
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        )}
        <div className="m-rosmol-care-head-text">
          <h3 className="m-rosmol-care-title">Служба заботы Росмолодёжи</h3>
          <p className="m-rosmol-care-lead">
            Если ваш вопрос выходит за рамки форума «Машук» или вы не нашли нужную информацию,
            вы всегда можете обратиться в Службу заботы Росмолодёжи. Здесь помогут с вопросами
            участия в проектах и мероприятиях Росмолодёжи, а также подскажут, куда обратиться
            в вашей ситуации.
          </p>
        </div>
      </div>

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

      <details className="m-rosmol-care-details">
        <summary className="m-rosmol-care-summary">Подробнее о Службе заботы</summary>
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
      </details>
    </section>
  );
}

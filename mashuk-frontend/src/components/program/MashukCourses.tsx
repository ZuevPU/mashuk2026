import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openExternalUrl } from '../../utils/openUrl';
import mentorshipCover from '../../assets/courses/mentorship.png';
import pedagogyCover from '../../assets/courses/pedagogy.png';
import mashukLogo from '../../assets/courses/mashuk-knowledge-logo.png';

export const MASHUK_COURSES = [
  {
    id: 'mentorship',
    title: 'Наставничество в цифровой среде: практические инструменты и безопасность',
    description: 'Онлайн-курс Центра знаний «Машук»: этика наставничества, безопасность в цифровой среде и работа с ИИ. Видеолекции, практика и сертификат.',
    tags: ['этика', 'безопасность', 'ИИ'],
    image: mentorshipCover,
    registerUrl: 'https://lms.mashuk.online/education/listener/course_sessions/nastavnichestvo-v-tsifrovoi-srede-prakticheskie-instrumenty-i-bezopasnost-07-27/register',
  },
  {
    id: 'pedagogy',
    title: 'Педагогика будущего: внедрение современных технологий в образовательный процесс',
    description: 'Онлайн образовательное мероприятие Центра знаний «Машук»: ИИ, современные технологии и практика внедрения в учебный процесс.',
    tags: ['ИИ', 'технологии', 'практика'],
    image: pedagogyCover,
    registerUrl: 'https://lms.mashuk.online/education/listener/course_sessions/pedagogika-buduschego-vnedrenie-sovremennyh-tehnologii-v-obrazovatelnyi-protsess-07-20/register',
  },
] as const;

export function MashukCoursesButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="kb-courses-btn" onClick={onOpen}>
      <span>Онлайн-курсы от</span>
      <img className="kb-courses-logo" src={mashukLogo} alt="Центр знаний Машук" />
    </button>
  );
}

export function MashukCoursesSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="kb-courses-overlay" onClick={onClose} role="presentation">
      <div
        className="kb-courses-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-courses-title"
        onClick={e => e.stopPropagation()}
      >
        <button type="button" className="kb-courses-x" onClick={onClose} aria-label="Закрыть">
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M2.1 2.1l7.8 7.8M9.9 2.1L2.1 9.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="kb-courses-scroll">
          <div className="kb-courses-head">
            <div className="kb-courses-kicker">Центр знаний «Машук»</div>
            <h3 id="kb-courses-title">Онлайн-курсы</h3>
            <p>Приходи учиться в Центр знаний «Машук» — онлайн, бесплатно и эффективно.</p>
          </div>
          <div className="kb-courses-list">
            {MASHUK_COURSES.map(course => (
              <article key={course.id} className="kb-course-card">
                <img className="kb-course-cover" src={course.image} alt="" />
                <div className="kb-course-body">
                  <h4>{course.title}</h4>
                  <p>{course.description}</p>
                  <div className="kb-course-tags">
                    {course.tags.map(tag => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="kb-course-reg"
                    onClick={() => openExternalUrl(course.registerUrl)}
                  >
                    Регистрация
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useMashukCourses() {
  const [open, setOpen] = useState(false);
  return {
    open,
    openCourses: () => setOpen(true),
    closeCourses: () => setOpen(false),
    sheet: <MashukCoursesSheet open={open} onClose={() => setOpen(false)} />,
  };
}

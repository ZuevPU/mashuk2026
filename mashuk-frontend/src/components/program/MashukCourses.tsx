import { useState } from 'react';
import { openExternalUrl } from '../../utils/openUrl';
import mentorshipCover from '../../assets/courses/mentorship.png';
import pedagogyCover from '../../assets/courses/pedagogy.png';

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
      Онлайн-курсы от Центра знаний Машук
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
  if (!open) return null;
  return (
    <div className="kb-courses-overlay" onClick={onClose} role="presentation">
      <div
        className="kb-courses-sheet"
        role="dialog"
        aria-labelledby="kb-courses-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="kb-courses-handle" aria-hidden />
        <div className="kb-courses-head">
          <div className="kb-courses-kicker">Центр знаний «Машук»</div>
          <h3 id="kb-courses-title">Онлайн-курсы</h3>
          <p>Запись открыта. Сначала наставничество, затем педагогика будущего.</p>
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
        <button type="button" className="kb-courses-close" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
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

import {
  createHashRouter,
} from '@vkontakte/vk-mini-apps-router';

export const PAGE_MAIN = '/';
export const PAGE_PROGRAM = '/program';
export const PAGE_TASKS = '/tasks';
export const PAGE_QUESTIONS = '/questions';
export const PAGE_PROFILE = '/profile';
export const PAGE_REGISTRATION = '/registration';
export const PAGE_VOLUNTEER = '/volunteer';

export const router = createHashRouter([
  {
    path: PAGE_MAIN,
    panel: 'home',
    view: 'main',
  },
  {
    path: PAGE_PROGRAM,
    panel: 'program',
    view: 'main',
  },
  {
    path: PAGE_TASKS,
    panel: 'tasks',
    view: 'main',
  },
  {
    path: PAGE_QUESTIONS,
    panel: 'questions',
    view: 'main',
  },
  {
    path: PAGE_PROFILE,
    panel: 'profile',
    view: 'main',
  },
  {
    path: PAGE_REGISTRATION,
    panel: 'registration',
    view: 'main',
  },
  {
    path: PAGE_VOLUNTEER,
    panel: 'volunteer',
    view: 'main',
  },
]);

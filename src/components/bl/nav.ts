// Рөлдік мәзір (karta §2–§4, D90): оқушы 5, мұғалім 4, ата-ана 3, басқарма әкімшісі 5, платформа иесі 5 бөлім.
import type { ComponentType } from 'react';

import {
  ChatIcon,
  ChildIcon,
  ExamIcon,
  GamesIcon,
  LessonsIcon,
  PanelIcon,
  ProfileIcon,
  ReviewIcon,
  SettingsIcon,
  ShieldIcon,
  TutorIcon,
  UsersIcon,
} from '@/components/bl/icons';
import type { UserRole } from '@/lib/auth-context';

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  match: (path: string) => boolean;
};

const starts =
  (...prefixes: string[]) =>
  (path: string) =>
    prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export const NAV: Record<UserRole, NavItem[]> = {
  student: [
    { to: '/ai-tutor', label: 'Тьютор', icon: TutorIcon, match: starts('/ai-tutor') },
    { to: '/exam', label: 'Емтихан', icon: ExamIcon, match: (p) => starts('/exam')(p) && !p.startsWith('/exam/profile') },
    { to: '/games', label: 'Ойындар', icon: GamesIcon, match: starts('/games') },
    { to: '/lessons', label: 'Сабақтар', icon: LessonsIcon, match: starts('/lessons', '/lab') },
    {
      to: '/profile',
      label: 'Профиль',
      icon: ProfileIcon,
      match: starts('/profile', '/settings', '/notifications', '/classes', '/chat', '/exam/profile'),
    },
  ],
  teacher: [
    {
      to: '/teacher',
      label: 'Панель',
      icon: PanelIcon,
      match: (p) =>
        p === '/teacher' || starts('/teacher/classes', '/teacher/students', '/teacher/games', '/settings', '/games', '/notifications')(p),
    },
    { to: '/teacher/review', label: 'Растау', icon: ReviewIcon, match: starts('/teacher/review', '/teacher/grades') },
    { to: '/teacher/lessons', label: 'Сабақтар', icon: LessonsIcon, match: starts('/teacher/lessons', '/lessons', '/lab') },
    { to: '/chat', label: 'Чат', icon: ChatIcon, match: starts('/chat') },
  ],
  parent: [
    { to: '/parent', label: 'Балам', icon: ChildIcon, match: starts('/parent') },
    { to: '/chat', label: 'Чат', icon: ChatIcon, match: starts('/chat') },
    { to: '/settings', label: 'Баптаулар', icon: SettingsIcon, match: starts('/settings', '/notifications') },
  ],
  // Білім басқармасының әкімшісі (басшысы): тек өз басқармасының мұғалімдері мен оқушылары.
  head: [
    { to: '/department', label: 'Басқарма', icon: PanelIcon, match: (p) => p === '/department' || p === '/dashboard' },
    { to: '/department/teachers', label: 'Мұғалімдер', icon: UsersIcon, match: starts('/department/teachers') },
    { to: '/department/students', label: 'Оқушылар', icon: ChildIcon, match: starts('/department/students') },
    { to: '/manage-lessons', label: 'Модерация', icon: ShieldIcon, match: starts('/manage-lessons', '/lessons') },
    { to: '/settings', label: 'Баптаулар', icon: SettingsIcon, match: starts('/settings', '/notifications') },
  ],
  // Платформа иесі (ішкі рөл атауы — admin).
  admin: [
    { to: '/departments', label: 'Басқармалар', icon: PanelIcon, match: starts('/departments', '/dashboard') },
    { to: '/manage-users', label: 'Пайдаланушылар', icon: UsersIcon, match: starts('/manage-users') },
    { to: '/subjects', label: 'Пәндер', icon: LessonsIcon, match: starts('/subjects') },
    { to: '/manage-lessons', label: 'Модерация', icon: ShieldIcon, match: starts('/manage-lessons', '/lessons') },
    { to: '/settings', label: 'Баптаулар', icon: SettingsIcon, match: starts('/settings', '/notifications') },
  ],
};

export const ROLE_TITLE: Record<UserRole, string> = {
  student: 'Оқушы',
  teacher: 'Мұғалім',
  parent: 'Ата-ана',
  head: 'Әкімші',
  admin: 'Платформа иесі',
};

export function homePathFor(role?: UserRole | null): string {
  if (role === 'teacher') return '/teacher';
  if (role === 'parent') return '/parent';
  if (role === 'head') return '/department';
  if (role === 'admin') return '/departments';
  return '/ai-tutor';
}

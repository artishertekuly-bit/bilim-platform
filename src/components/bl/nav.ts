// Рөлдік мәзір (karta §2–§4): оқушы 5, мұғалім 4, ата-ана 3, әкімші 4 бөлім.
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
    { to: '/lessons', label: 'Сабақтар', icon: LessonsIcon, match: starts('/lessons') },
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
      match: (p) => p === '/teacher' || starts('/teacher/classes', '/teacher/students', '/teacher/games', '/settings', '/games')(p),
    },
    { to: '/teacher/review', label: 'Растау', icon: ReviewIcon, match: starts('/teacher/review', '/teacher/grades') },
    { to: '/teacher/lessons', label: 'Сабақтар', icon: LessonsIcon, match: starts('/teacher/lessons', '/lessons') },
    { to: '/chat', label: 'Чат', icon: ChatIcon, match: starts('/chat') },
  ],
  parent: [
    { to: '/parent', label: 'Балам', icon: ChildIcon, match: starts('/parent') },
    { to: '/chat', label: 'Чат', icon: ChatIcon, match: starts('/chat') },
    { to: '/settings', label: 'Баптаулар', icon: SettingsIcon, match: starts('/settings') },
  ],
  admin: [
    { to: '/manage-users', label: 'Пайдаланушылар', icon: UsersIcon, match: starts('/manage-users', '/dashboard') },
    { to: '/subjects', label: 'Пәндер', icon: LessonsIcon, match: starts('/subjects') },
    { to: '/manage-lessons', label: 'Модерация', icon: ShieldIcon, match: starts('/manage-lessons', '/lessons') },
    { to: '/settings', label: 'Баптаулар', icon: SettingsIcon, match: starts('/settings') },
  ],
};

export function homePathFor(role?: UserRole | null): string {
  if (role === 'teacher') return '/teacher';
  if (role === 'parent') return '/parent';
  if (role === 'admin') return '/manage-users';
  return '/ai-tutor';
}

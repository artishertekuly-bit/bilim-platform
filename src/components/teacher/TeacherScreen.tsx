// Мұғалім аймағының қаңқасы (karta §4.1, D31): емтихан экрандарының стилі және төменгі мәзір
// «Панель · Растау · Сабақтар · Чат». Профиль — жоғарғы оң жақта.
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ExamScreen } from '@/components/exam/ExamUi';
import { cn } from '@/lib/utils';

const NAV = [
  {
    to: '/teacher',
    label: 'Панель',
    match: (path: string) =>
      path === '/teacher' || path.startsWith('/teacher/classes') || path.startsWith('/teacher/students'),
  },
  {
    to: '/teacher/review',
    label: 'Растау',
    match: (path: string) => path.startsWith('/teacher/review') || path.startsWith('/teacher/grades'),
  },
  { to: '/teacher/lessons', label: 'Сабақтар', match: (path: string) => path.startsWith('/teacher/lessons') },
  { to: '/chat', label: 'Чат', match: (path: string) => path === '/chat' },
];

function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export default function TeacherScreen({
  title,
  back,
  children,
}: {
  title: string;
  back?: string;
  children: ReactNode;
}) {
  const { pathname } = useLocation();

  return (
    <ExamScreen
      header={
        <header className="flex min-h-14 items-center gap-2 pb-1 pl-1 pr-4 pt-3">
          {back ? (
            <Link
              to={back}
              aria-label="Артқа"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#111111] hover:bg-[#ECE9E3]"
            >
              <BackIcon />
            </Link>
          ) : (
            <span className="w-3" />
          )}
          <h1 className="m-0 min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
          <Link
            to="/profile"
            aria-label="Профиль"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[#111111] hover:bg-[#ECE9E3]"
          >
            <ProfileIcon />
          </Link>
        </header>
      }
      footer={
        <nav aria-label="Мұғалім мәзірі" className="grid grid-cols-4 gap-1.5">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center justify-center rounded-xl text-sm font-semibold no-underline',
                  active ? 'bg-[#121212] text-white' : 'text-[#4A4A4A] hover:bg-[#ECE9E3]',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      }
    >
      {children}
    </ExamScreen>
  );
}

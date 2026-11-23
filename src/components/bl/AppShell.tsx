// Рөлдік қабық (karta §2–§4, канвастағы «desktopRule»): телефонда төменгі мәзір,
// 1024 px-тен бастап сол жақтағы мәзір. Түстер мен өлшемдер прототиптен.
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { LogoMark } from '@/components/bl/icons';
import { NAV, type NavItem } from '@/components/bl/nav';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

function BottomNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Негізгі мәзір"
      className="sticky bottom-0 z-20 grid border-t border-bl-line bg-white px-2 pb-[max(18px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const on = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-12 flex-col items-center gap-1 py-1.5 text-xs no-underline',
              on ? 'font-bold text-bl-ink' : 'font-medium text-bl-ink2',
            )}
          >
            <span className={cn('flex h-7 w-14 items-center justify-center rounded-full', on && 'bg-bl-soft')}>
              <Icon size={22} />
            </span>
            <span className="max-w-full truncate px-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SideRail({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Негізгі мәзір"
      className="sticky top-0 hidden h-[100dvh] w-[240px] flex-none flex-col gap-1 border-r border-bl-line bg-white px-4 py-6 lg:flex"
    >
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-bl-ink text-white">
          <LogoMark />
        </span>
        <span className="text-xl font-bold tracking-[-0.02em]">Bilim</span>
      </div>
      {items.map((item) => {
        const on = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] no-underline',
              on ? 'bg-bl-soft font-bold text-bl-ink' : 'font-medium text-bl-ink3 hover:bg-[#F6F5F2]',
            )}
          >
            <Icon size={22} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Негізгі мәзірі бар беттердің қабығы. `nav={false}` — мәзірсіз ішкі бет.
 * `fill` — бет экран биіктігіне сыяды, айналдыруды бет өзі басқарады (чат, Тьютор).
 */
export default function AppShell({ children, nav = true, fill = false }: { children: ReactNode; nav?: boolean; fill?: boolean }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const items = user ? NAV[user.role] : [];
  const showNav = nav && items.length > 0;

  return (
    <div className={cn('bg-bl-bg font-sans text-bl-ink lg:flex', fill ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]')}>
      {items.length ? <SideRail items={items} pathname={pathname} /> : null}
      <div className={cn('flex min-w-0 flex-1 flex-col', fill ? 'h-full' : 'min-h-[100dvh]')}>
        <main className={cn('flex flex-1 flex-col', fill && 'min-h-0 overflow-hidden')}>{children}</main>
        {showNav ? <BottomNav items={items} pathname={pathname} /> : null}
      </div>
    </div>
  );
}

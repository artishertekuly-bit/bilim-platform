// Жүйе күйлері (дизайн: SystemStates.dc.html): 404, интернет жоқ, сервер қатесі, рұқсат жоқ.
import { useEffect, useState } from 'react';

import { homePathFor } from '@/components/bl/nav';
import { BareScreen, Button, ButtonLink, StateCard } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';

function HomeLink() {
  const { user } = useAuth();
  return (
    <ButtonLink to={user ? homePathFor(user.role) : '/'} variant="secondary" size="md">
      Бастапқы бетке
    </ButtonLink>
  );
}

export function NotFoundScreen() {
  return (
    <BareScreen className="justify-center gap-4 px-4 py-6">
      <StateCard mark="404" title="Бет табылмады" text="Сілтеме ескірген немесе бет жойылған.">
        <HomeLink />
      </StateCard>
    </BareScreen>
  );
}

export function AccessDeniedScreen() {
  return (
    <BareScreen className="justify-center gap-4 px-4 py-6">
      <StateCard mark="×" title="Бұл бет сіздің рөліңізге ашық емес" text="Рөліңіз қате деп ойласаңыз, мектеп әкімшісіне жазыңыз.">
        <HomeLink />
      </StateCard>
    </BareScreen>
  );
}

/** Қатеден кейін бүкіл қосымша құлағанда (error boundary ішінде — роутер контекстінсіз). */
export function CrashScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col justify-center gap-4 bg-bl-bg px-4 py-6 font-sans text-bl-ink">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4">
        <section className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-8 text-center">
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-soft text-lg font-bold">
            !
          </span>
          <h1 className="m-0 text-[22px] font-bold">Бірдеңе дұрыс болмады</h1>
          <p className="m-0 text-[15px] leading-normal text-bl-ink3">Сервер жауап бермеді не бетте қате шықты. Сәлден кейін қайталап көріңіз.</p>
        </section>
        <Button onClick={onRetry}>Қайталау</Button>
        <a
          href="/"
          className="flex h-12 items-center justify-center rounded-[14px] border border-bl-field bg-white text-[15px] font-semibold text-bl-ink no-underline"
        >
          Бастапқы бетке
        </a>
      </div>
    </div>
  );
}

/** Желі үзілгенде экранның жоғарғы жағында шығатын хабар. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(8px,env(safe-area-inset-top))]">
      <span className="rounded-full bg-bl-ink px-4 py-2 font-sans text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
        Интернет жоқ · жауаптар байланыс қалпына келгенде жіберіледі
      </span>
    </div>
  );
}

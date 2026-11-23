// Оқушының алғашқы кіруі: қош келдіңіз → сынып коды → қосылды (дизайн: Onboarding.dc.html).
import { useState, type ComponentType } from 'react';

import JoinClassPanel from '@/components/bl/JoinClassPanel';
import { CheckIcon, ExamIcon, GamesIcon, LessonsIcon, TutorIcon } from '@/components/bl/icons';
import { BareScreen, Button, ButtonLink } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import type { ClassPreview } from '@/lib/classes-api';
import { cn } from '@/lib/utils';

export const ONBOARDED_KEY = 'bilim.onboarded';

const SECTIONS: { title: string; text: string; icon: ComponentType<{ size?: number }> }[] = [
  { title: 'Тьютор', text: 'Түсінбеген тақырыпты сұраңыз', icon: TutorIcon },
  { title: 'Емтихан', text: 'Төрт деңгейдің кез келгенінен бастаңыз', icon: ExamIcon },
  { title: 'Ойындар', text: 'Сыныптастармен бөлме ашыңыз', icon: GamesIcon },
  { title: 'Сабақтар', text: 'Өмірде керек дағдылар туралы', icon: LessonsIcon },
];

function markOnboarded() {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* жеке терезеде сақталмауы мүмкін */
  }
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<'hello' | 'class' | 'joined'>('hello');
  const [joined, setJoined] = useState<ClassPreview | null>(null);
  const firstName = (user?.fullName ?? '').trim().split(/\s+/)[0] ?? '';

  const footer =
    step === 'hello' ? (
      <Button onClick={() => setStep('class')}>Жалғастыру</Button>
    ) : step === 'class' ? (
      <ButtonLink to="/ai-tutor" variant="secondary" onClick={markOnboarded}>
        Кейінірек
      </ButtonLink>
    ) : (
      <ButtonLink to="/ai-tutor" onClick={markOnboarded}>
        Тьюторға өту
      </ButtonLink>
    );

  return (
    <BareScreen footer={footer}>
      <div aria-hidden="true" className="grid grid-cols-2 gap-1.5 px-5 pb-1 pt-5">
        <span className="h-1 rounded-full bg-bl-ink" />
        <span className={cn('h-1 rounded-full', step === 'hello' ? 'bg-bl-handle' : 'bg-bl-ink')} />
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        {step === 'hello' ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">
                Қош келдіңіз{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p className="m-0 text-base leading-normal text-bl-ink2">Бастау үшін Тьютордан сұрақ қойып көріңіз: онда баға қойылмайды.</p>
            </div>
            <section className="flex flex-col rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {SECTIONS.map(({ title, text, icon: Icon }) => (
                <div key={title} className="flex items-center gap-3.5 px-4 py-3.5">
                  <Icon size={22} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{title}</span>
                    <span className="text-[13px] text-bl-ink2">{text}</span>
                  </span>
                </div>
              ))}
            </section>
          </>
        ) : null}

        {step === 'class' ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="m-0 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">Сыныбыңыздың коды бар ма?</h1>
              <p className="m-0 text-[15px] leading-normal text-bl-ink2">
                Қосылсаңыз, мұғалім пәні бойынша емтихан нәтижеңізді көреді және чатта жаза алады. Кодты кейін Профильден де
                енгізуге болады.
              </p>
            </div>
            <JoinClassPanel
              onJoined={(cls) => {
                setJoined(cls);
                setStep('joined');
              }}
            />
          </>
        ) : null}

        {step === 'joined' ? (
          <section role="status" className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-okbg text-bl-oktext">
              <CheckIcon size={28} />
            </span>
            <h1 className="m-0 text-[22px] font-bold">Сыныпқа қосылдыңыз</h1>
            {joined ? (
              <span className="text-[15px] font-semibold">
                {joined.title} · {joined.teacher_name}
              </span>
            ) : null}
            <p className="m-0 text-[15px] leading-normal text-bl-ink3">
              Тьютормен диалогтарыңыз жеке болып қалады: мұғалімге тек қауіпсіздік ережесін бұзған хабарлама жіберіледі.
            </p>
          </section>
        ) : null}
      </div>
    </BareScreen>
  );
}

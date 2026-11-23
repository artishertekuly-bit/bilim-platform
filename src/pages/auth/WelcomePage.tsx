// Басты бет — кірмеген адамға (дизайн: Welcome.dc.html).
import type { ComponentType } from 'react';

import { ExamIcon, GamesIcon, LogoMark, TutorIcon } from '@/components/bl/icons';
import { BareScreen, ButtonLink } from '@/components/bl/ui';

const FEATURES: { title: string; text: string; icon: ComponentType<{ size?: number }> }[] = [
  { title: 'Тьютор', text: 'Оқулықтағы тақырыпты сұрақпен түсіндіреді. Баға қоймайды.', icon: TutorIcon },
  { title: 'Емтихан', text: 'Білу, қолдану және пайымдау деңгейлерін бөлек тексереді.', icon: ExamIcon },
  { title: 'Ойындар', text: 'Сұрақтары оқулықтан алынған бес ойын: сыныппен немесе ботпен.', icon: GamesIcon },
];

export default function WelcomePage() {
  return (
    <BareScreen
      footer={
        <div className="flex flex-col gap-2.5 pb-1">
          <ButtonLink to="/register">Тіркелу</ButtonLink>
          <ButtonLink to="/login" variant="secondary">
            Кіру
          </ButtonLink>
        </div>
      }
    >
      <div className="flex flex-col gap-7 px-5 pb-5 pt-10">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-bl-ink text-white">
            <LogoMark size={24} />
          </span>
          <span className="text-[26px] font-bold tracking-[-0.02em]">Bilim</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-[30px] font-bold leading-[1.15] tracking-[-0.02em]">Оқулық бойынша оқу, емтихан және ойын</h1>
          <p className="m-0 text-base leading-normal text-bl-ink2">
            Сұрағыңызға оқулықтан түсіндіретін Тьютор, төрт деңгейлі емтихан және сыныптастармен ойындар бір қосымшада.
          </p>
        </div>

        <section className="flex flex-col rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
          {FEATURES.map(({ title, text, icon: Icon }) => (
            <div key={title} className="flex items-start gap-3.5 p-4">
              <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-bl-soft">
                <Icon size={22} />
              </span>
              <span className="flex flex-col gap-[3px]">
                <span className="text-base font-semibold">{title}</span>
                <span className="text-sm leading-[1.4] text-bl-ink2">{text}</span>
              </span>
            </div>
          ))}
        </section>
      </div>
    </BareScreen>
  );
}

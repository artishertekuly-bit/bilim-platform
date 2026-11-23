// Оқушының бастапқы беті (karta §3.1, D31, D32, D47): аймақтар бір-біріне кірмейді, әр аймаққа бір карта.
// Курстар мен тесттер алынды (D19): оқулық материалы — Tutor мен Examiner-де, өмірлік дағдылар — Сабақтарда.
import { Link } from 'react-router-dom';

import { Card, ExamScreen, SectionLabel } from '@/components/exam/ExamUi';
import { useAuth } from '@/lib/auth-context';

const AREAS = [
  { to: '/ai-tutor', title: 'Тьютор', text: 'Тақырыпты түсіндіреді, баға қоймайды' },
  { to: '/exam', title: 'Емтихан', text: 'Оқулық бойынша төрт деңгей: білу, қолдану, пайымдау' },
  { to: '/lessons', title: 'Сабақтар', text: 'Өмірлік дағдылар туралы сабақтар және сақталғандар' },
  { to: '/exam/profile', title: 'Профиль', text: 'Өз нәтижем: P1…P4 және F' },
  { to: '/classes', title: 'Сыныптарым', text: 'Сыныпқа кодпен қосылу, мұғалімдерім, ата-ана сұранысы' },
  { to: '/chat', title: 'Чат', text: 'Сынып мұғалімдерімен хабарласу' },
];

export default function StudentHomePage() {
  const { user } = useAuth();
  const name = user?.fullName?.trim().split(/\s+/)[0];
  return (
    <ExamScreen
      header={
        <header className="flex min-h-14 items-center gap-2 px-4 pb-1 pt-3">
          <h1 className="m-0 flex-1 truncate text-lg font-bold">{name ? `Сәлем, ${name}!` : 'Сәлем!'}</h1>
          <Link to="/profile" className="text-sm font-semibold text-[#111111]">
            Баптаулар
          </Link>
        </header>
      }
    >
      <SectionLabel>Бүгін не істейміз?</SectionLabel>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {AREAS.map((area) => (
          <Link key={area.to} to={area.to} className="no-underline text-inherit">
            <Card className="flex h-full flex-col gap-1 px-4 py-4 transition-colors hover:border-[#111111]">
              <span className="text-[17px] font-bold">{area.title}</span>
              <span className="text-[13px] leading-snug text-[#5E5E5E]">{area.text}</span>
            </Card>
          </Link>
        ))}
      </div>
    </ExamScreen>
  );
}

// Құпиясөз: сілтеме сұрау → хат жіберілді → жаңа құпиясөз → жаңартылды (дизайн: PasswordReset.dc.html).
// Жаңа құпиясөз беті үш жерде: хаттағы сілтеме (/update-password), алғашқы кіру (/setup-password),
// баптаулардан өзгерту (/settings/password).
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { CheckIcon } from '@/components/bl/icons';
import { Banner, BareScreen, Button, ButtonLink, Field, TextInput, TopBar } from '@/components/bl/ui';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MIN_PASSWORD, authErrorText, isEmailLike } from '@/pages/auth/authText';

function MailMark() {
  return (
    <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-soft">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    </span>
  );
}

function DoneCard({ title, text, icon }: { title: string; text: string; icon: 'mail' | 'check' }) {
  return (
    <section role="status" className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
      {icon === 'mail' ? (
        <MailMark />
      ) : (
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-okbg text-bl-oktext">
          <CheckIcon size={28} />
        </span>
      )}
      <h1 className="m-0 text-[22px] font-bold">{title}</h1>
      <p className="m-0 text-[15px] leading-normal text-bl-ink3">{text}</p>
    </section>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!isEmailLike(email) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
      setCooldown(60);
    } catch (err) {
      setError(authErrorText(err, 'Сілтеме жіберу мүмкін болмады.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BareScreen
      header={<TopBar back="/login" backLabel="Кіруге оралу" />}
      footer={
        sent ? (
          <ButtonLink to="/login">Кіруге оралу</ButtonLink>
        ) : (
          <Button type="submit" form="forgot-form" disabled={!isEmailLike(email)} loading={busy}>
            Сілтеме жіберу
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-[18px] px-5 pb-5 pt-1">
        {sent ? (
          <>
            <DoneCard
              icon="mail"
              title="Хатты тексеріңіз"
              text={`${email} адресіне сілтеме жібердік. Хат келмесе, «Спам» қалтасын тексеріңіз немесе қайта жіберіңіз.`}
            />
            <Button variant="secondary" size="md" onClick={() => send()} disabled={cooldown > 0} loading={busy}>
              {cooldown > 0 ? `Қайта жіберу · 0:${String(cooldown).padStart(2, '0')}` : 'Қайта жіберу'}
            </Button>
          </>
        ) : (
          <form id="forgot-form" noValidate onSubmit={send} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">Құпиясөзді қалпына келтіру</h1>
              <p className="m-0 text-[15px] leading-[1.45] text-bl-ink2">
                Аккаунтыңыздың email-ын енгізіңіз. Жаңа құпиясөз қоятын сілтеме жібереміз.
              </p>
            </div>
            <Field label="Email" htmlFor="forgot-email">
              <TextInput
                id="forgot-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="aliya@mail.kz"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </Field>
          </form>
        )}
        {error ? (
          <Banner tone="bad" icon>
            {error}
          </Banner>
        ) : null}
      </div>
    </BareScreen>
  );
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.startsWith('/setup-password')) {
    return '/dashboard';
  }
  return value.slice(0, 300);
}

export function NewPasswordPage({ mode }: { mode: 'recovery' | 'setup' | 'change' }) {
  const { session, isLoading, updatePassword, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mismatch = pw2.length > 0 && pw1 !== pw2;
  const ready = pw1.length >= MIN_PASSWORD && pw1 === pw2 && Boolean(session);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(pw1);
      await supabase.auth.updateUser({
        data: { password_setup_completed: true, password_setup_completed_at: new Date().toISOString() },
      });
      await refreshUser();
      if (mode === 'setup') {
        navigate(safeNextPath(params.get('next')), { replace: true });
        return;
      }
      setSaved(true);
      setPw1('');
      setPw2('');
    } catch (err) {
      setError(authErrorText(err, 'Құпиясөзді сақтау мүмкін болмады.'));
    } finally {
      setBusy(false);
    }
  };

  const back = mode === 'change' ? '/settings' : mode === 'recovery' ? '/login' : undefined;
  const linkExpired = mode === 'recovery' && !isLoading && !session && !saved;

  const footer = saved ? (
    mode === 'change' ? (
      <ButtonLink to="/settings">Баптауларға оралу</ButtonLink>
    ) : (
      <ButtonLink to="/dashboard">Жалғастыру</ButtonLink>
    )
  ) : linkExpired ? (
    <ButtonLink to="/forgot-password">Жаңа сілтеме сұрау</ButtonLink>
  ) : (
    <Button type="submit" form="new-password-form" disabled={!ready} loading={busy}>
      {busy ? 'Сақталуда…' : 'Сақтау'}
    </Button>
  );

  return (
    <BareScreen
      header={
        back ? (
          <TopBar back={back} backLabel={mode === 'change' ? 'Баптауларға оралу' : 'Кіруге оралу'} />
        ) : (
          <TopBar
            right={
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/', { replace: true });
                }}
                className="h-11 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold text-bl-ink3 hover:bg-bl-soft"
              >
                Шығу
              </button>
            }
          />
        )
      }
      footer={footer}
    >
      <div className="flex flex-col gap-[18px] px-5 pb-5 pt-1">
        {saved ? (
          <DoneCard icon="check" title="Құпиясөз жаңартылды" text="Енді жаңа құпиясөзбен кіре аласыз." />
        ) : linkExpired ? (
          <DoneCard
            icon="mail"
            title="Сілтеме ескірген"
            text="Құпиясөз сілтемесі бір рет және шектеулі уақыт жұмыс істейді. Жаңа сілтеме сұраңыз."
          />
        ) : (
          <form id="new-password-form" noValidate onSubmit={save} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">
                {mode === 'change' ? 'Құпиясөзді өзгерту' : 'Жаңа құпиясөз'}
              </h1>
              <p className="m-0 text-[15px] leading-[1.45] text-bl-ink2">
                {mode === 'setup'
                  ? 'Аккаунтыңызға алғаш кіріп тұрсыз. Келесі жолы email мен осы құпиясөз арқылы кіресіз.'
                  : mode === 'change'
                    ? 'Жаңа құпиясөз барлық құрылғыда бірден қолданылады.'
                    : 'Мұғалім немесе ата-ана аккаунтына алғаш кіргенде де құпиясөз осы бетте қойылады.'}
              </p>
            </div>
            <Field label="Жаңа құпиясөз" htmlFor="pw-new" hint={`Кемінде ${MIN_PASSWORD} таңба`}>
              <TextInput
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                aria-describedby="pw-new-hint"
              />
            </Field>
            <Field label="Құпиясөзді қайталаңыз" htmlFor="pw-repeat" error={mismatch ? 'Құпиясөздер сәйкес емес' : undefined}>
              <TextInput
                id="pw-repeat"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                aria-invalid={mismatch || undefined}
                aria-describedby={mismatch ? 'pw-repeat-error' : undefined}
              />
            </Field>
            {error ? (
              <Banner tone="bad" icon>
                {error}
              </Banner>
            ) : null}
          </form>
        )}
      </div>
    </BareScreen>
  );
}

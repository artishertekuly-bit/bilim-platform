// Тіркелу: деректер → поштаға келген 6 таңбалы код (дизайн: Register.dc.html).
// Тек оқушы аккаунты ашылады; мұғалім мен ата-ана рөлін әкімші береді (karta §2).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Banner, BareScreen, Button, Field, OrDivider, TextInput, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { MIN_PASSWORD, authErrorText, isEmailLike } from '@/pages/auth/authText';
import { cn } from '@/lib/utils';

const RESEND_SECONDS = 60;

export default function RegisterPage({ initialStep = 'form' }: { initialStep?: 'form' | 'code' }) {
  const { register, loginWithGoogle, verifyEmailOtp, resendSignupOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const incomingEmail = (location.state as { email?: string } | null)?.email ?? '';

  const [step, setStep] = useState<'form' | 'code'>(initialStep);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(incomingEmail);
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [left, setLeft] = useState(initialStep === 'code' ? 0 : RESEND_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (step !== 'code' || left <= 0) return;
    timer.current = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [step, left]);

  const pwOk = password.length >= MIN_PASSWORD;
  const formReady = name.trim().length >= 3 && isEmailLike(email) && pwOk;
  const otpReady = otp.length === 6 && isEmailLike(email);

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!formReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await register(email.trim(), password, name.trim());
      if (result.requiresEmailConfirmation) {
        setStep('code');
        setOtp('');
        setLeft(RESEND_SECONDS);
      } else {
        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      setError(authErrorText(err, 'Тіркелу мүмкін болмады. Қайталап көріңіз.'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEmailOtp(email.trim(), otp);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(authErrorText(err, 'Кодты растау мүмкін болмады.'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!isEmailLike(email)) return;
    setError(null);
    setInfo(null);
    try {
      await resendSignupOtp(email.trim());
      setLeft(RESEND_SECONDS);
      setInfo('Жаңа код жіберілді.');
    } catch (err) {
      setError(authErrorText(err));
    }
  };

  const google = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      await loginWithGoogle('student');
    } catch (err) {
      setError(authErrorText(err, 'Google арқылы тіркелу мүмкін болмады.'));
      setGoogleBusy(false);
    }
  };

  const header = (
    <TopBar
      back={step === 'form' ? '/' : undefined}
      onBack={step === 'code' && initialStep === 'form' ? () => setStep('form') : undefined}
      backLabel={step === 'form' ? 'Басты бетке оралу' : 'Деректерге оралу'}
      right={initialStep === 'form' ? <span className="text-sm text-bl-ink2">{step === 'form' ? '1 / 2' : '2 / 2'}</span> : undefined}
    />
  );

  if (step === 'code') {
    return (
      <BareScreen
        header={initialStep === 'code' ? <TopBar back="/login" backLabel="Кіруге оралу" /> : header}
        footer={
          <Button type="submit" form="otp-form" disabled={!otpReady} loading={busy}>
            {busy ? 'Тексерілуде…' : 'Растау'}
          </Button>
        }
      >
        <form id="otp-form" noValidate onSubmit={submitCode} className="flex flex-col gap-[18px] px-5 pb-5 pt-1">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">Поштаңызды растаңыз</h1>
            <p className="m-0 text-[15px] leading-[1.45] text-bl-ink2">
              {incomingEmail || initialStep === 'form' ? `${email} адресіне` : 'Поштаңызға'} 6 таңбалы код жібердік. Хат келмесе, «Спам»
              қалтасын тексеріңіз.
            </p>
          </div>

          {!incomingEmail && initialStep === 'code' ? (
            <Field label="Email" htmlFor="otp-email">
              <TextInput id="otp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
            </Field>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="otp-code" className="text-sm font-semibold">
              Код
            </label>
            <TextInput
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              className="h-16 text-center text-[28px] font-bold tracking-[0.3em] tabular-nums"
            />
            <span className="self-end text-[13px] text-bl-ink2">{otp.length} / 6</span>
          </div>

          {error ? (
            <Banner tone="bad" icon>
              {error}
            </Banner>
          ) : null}
          {info ? <Banner tone="good">{info}</Banner> : null}

          {left > 0 ? (
            <span className="text-sm text-bl-ink2" aria-live="polite">
              Кодты қайта жіберу · 0:{String(left).padStart(2, '0')}
            </span>
          ) : (
            <Button variant="secondary" size="sm" full={false} className="self-start" onClick={resend} disabled={!isEmailLike(email)}>
              Кодты қайта жіберу
            </Button>
          )}
        </form>
      </BareScreen>
    );
  }

  return (
    <BareScreen
      header={header}
      footer={
        <>
          <Button type="submit" form="register-form" disabled={!formReady} loading={busy}>
            {busy ? 'Тіркелуде…' : 'Тіркелу'}
          </Button>
          <Link to="/login" className="flex min-h-11 items-center justify-center text-sm text-bl-ink3 no-underline">
            Аккаунтыңыз бар ма?&nbsp;<span className="font-semibold text-bl-ink underline">Кіру</span>
          </Link>
        </>
      }
    >
      <form id="register-form" noValidate onSubmit={submitForm} className="flex flex-col gap-[18px] px-5 pb-5 pt-1">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">Тіркелу</h1>
          <p className="m-0 text-[15px] leading-[1.45] text-bl-ink2">
            Оқушы аккаунты ашылады. Мұғалім мен ата-ана аккаунтының рөлін әкімші береді.
          </p>
        </div>

        <Button variant="secondary" onClick={google} loading={googleBusy}>
          Google арқылы жалғастыру
        </Button>
        <OrDivider />

        <Field label="Аты-жөніңіз" htmlFor="reg-name">
          <TextInput
            id="reg-name"
            type="text"
            autoComplete="name"
            maxLength={180}
            placeholder="Әлия Нұрланқызы"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="reg-email">
          <TextInput
            id="reg-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="aliya@mail.kz"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value.trim());
              setError(null);
            }}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <label htmlFor="reg-password" className="text-sm font-semibold">
            Құпиясөз
          </label>
          <TextInput
            id="reg-password"
            type="password"
            autoComplete="new-password"
            aria-describedby="reg-password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span
            id="reg-password-hint"
            className={cn('text-[13px]', password.length > 0 && !pwOk ? 'font-semibold text-bl-danger' : 'text-bl-ink2')}
          >
            {password.length === 0 || pwOk ? `Кемінде ${MIN_PASSWORD} таңба` : `Тағы ${MIN_PASSWORD - password.length} таңба керек`}
          </span>
        </div>

        {error ? (
          <Banner tone="bad" icon>
            {error}
          </Banner>
        ) : null}
      </form>
    </BareScreen>
  );
}

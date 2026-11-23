// Кіру (дизайн: Login.dc.html). Кіргеннен кейін рөлге қарай бастапқы бет (karta §3.1).
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Banner, BareScreen, Button, Field, OrDivider, PasswordInput, TextInput, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { authErrorText } from '@/pages/auth/authText';

type FromState = { from?: { pathname?: string; search?: string }; info?: string } | null;

const BLOCKED_NEXT = ['/login', '/register', '/forgot-password', '/verify-email', '/update-password', '/'];

function safeNext(state: FromState): string {
  const path = state?.from?.pathname ?? '';
  if (!path.startsWith('/') || path.startsWith('//') || BLOCKED_NEXT.includes(path)) return '/dashboard';
  const search = state?.from?.search ?? '';
  return `${path.slice(0, 300)}${search.startsWith('?') ? search.slice(0, 300) : ''}`;
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FromState;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const ready = email.trim().indexOf('@') > 0 && password.length >= 6;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setNeedsCode(false);
    try {
      const result = await login(email.trim(), password);
      if (result.requiresEmailConfirmation) {
        setNeedsCode(true);
        return;
      }
      navigate(safeNext(state), { replace: true });
    } catch (err) {
      const text = authErrorText(err, 'Кіру мүмкін болмады. Қайталап көріңіз.');
      if (err instanceof Error && err.message.toLowerCase().includes('email not confirmed')) setNeedsCode(true);
      else setError(text);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(authErrorText(err, 'Google арқылы кіру мүмкін болмады.'));
      setGoogleBusy(false);
    }
  };

  return (
    <BareScreen
      header={<TopBar back="/" backLabel="Басты бетке оралу" />}
      footer={
        <>
          <Button type="submit" form="login-form" disabled={!ready} loading={busy}>
            {busy ? 'Кіруде…' : 'Кіру'}
          </Button>
          <Link to="/register" className="flex min-h-11 items-center justify-center text-sm text-bl-ink3 no-underline">
            Аккаунтыңыз жоқ па?&nbsp;<span className="font-semibold text-bl-ink underline">Тіркелу</span>
          </Link>
        </>
      }
    >
      <form id="login-form" noValidate onSubmit={submit} className="flex flex-col gap-[18px] px-5 pb-5 pt-1">
        <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">Кіру</h1>

        {state?.info ? <Banner tone="info">{state.info}</Banner> : null}

        <Button variant="secondary" onClick={google} loading={googleBusy}>
          Google арқылы кіру
        </Button>
        <OrDivider />

        <Field label="Email" htmlFor="login-email">
          <TextInput
            id="login-email"
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
          <label htmlFor="login-password" className="text-sm font-semibold">
            Құпиясөз
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <Link to="/forgot-password" state={{ email }} className="flex min-h-11 items-center self-start text-sm font-semibold text-bl-ink">
            Құпиясөзді ұмыттыңыз ба?
          </Link>
        </div>

        {error ? (
          <Banner tone="bad" icon>
            {error}
          </Banner>
        ) : null}
        {needsCode ? (
          <Banner tone="warn">
            <span className="flex flex-col items-start gap-2">
              Email әлі расталмаған. Поштаға келген 6 таңбалы кодты енгізіңіз.
              <Link to="/verify-email" state={{ email: email.trim() }} className="font-semibold text-bl-warntext underline">
                Кодты енгізу
              </Link>
            </span>
          </Banner>
        ) : null}
      </form>
    </BareScreen>
  );
}

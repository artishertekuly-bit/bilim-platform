// Supabase Auth қателерін қазақшаға аудару (ағылшынша мәтін пайдаланушыға шықпайды).
export function authErrorText(error: unknown, fallback = 'Бірдеңе дұрыс болмады. Қайталап көріңіз.'): string {
  const raw = error instanceof Error ? error.message : '';
  const m = raw.toLowerCase();
  if (!m) return fallback;
  if (m.includes('invalid login credentials')) return 'Email немесе құпиясөз қате. Қайта тексеріп көріңіз.';
  if (m.includes('email not confirmed')) return 'Email әлі расталмаған. Поштаға келген кодты енгізіңіз.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Бұл email тіркелген. Кіру бетіне өтіңіз.';
  if (m.includes('token has expired') || m.includes('otp') || m.includes('invalid token')) return 'Код қате немесе ескірген. Жаңа код сұраңыз.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Тым жиі сұраныс жібердіңіз. Біраз күтіп, қайталаңыз.';
  if (m.includes('same') && m.includes('password')) return 'Жаңа құпиясөз бұрынғысынан өзгеше болсын.';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least'))) return 'Құпиясөз тым әлсіз. Кемінде 8 таңба, әріп пен сан қосыңыз.';
  if (m.includes('network') || m.includes('fetch')) return 'Интернет байланысын тексеріп, қайталаңыз.';
  if (/[а-яәіңғүұқөһ]/i.test(raw)) return raw;
  return fallback;
}

export const MIN_PASSWORD = 8;

export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

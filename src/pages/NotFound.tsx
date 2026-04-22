import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import t from '@/lib/i18n';

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    document.title = `404 · ${t('page.not_found.title')}`;

    if (import.meta.env.DEV) {
      console.warn('404 route:', {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      });
    }
  }, [location.pathname, location.search, location.hash]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-8 text-center shadow-sm">
        <h1 className="mb-3 text-4xl font-bold">404</h1>

        <p className="mb-2 text-xl font-semibold">
          {t('page.not_found.title')}
        </p>

        <p className="mb-6 text-sm text-muted-foreground">
          {t('page.not_found.text')}
        </p>

        <Link
          to="/"
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('page.not_found.back_home')}
        </Link>
      </div>
    </main>
  );
}
// QR-дан ашылатын бет (D46): /games/join?code=XXXXXX — бөлмеге кіріп, бірден бөлме бетіне апарады.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Banner, ExamScreen, LoadingBlock, SecondaryLink, SimpleHeader } from '@/components/exam/ExamUi';
import { GamesApiError, useGamesApi } from '@/lib/games-api';
import { useAuth } from '@/lib/auth-context';

export default function GameJoinPage() {
  const [params] = useSearchParams();
  const api = useGamesApi();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const code = (params.get('code') ?? '').trim().toUpperCase();

  useEffect(() => {
    if (!session?.access_token || started.current) return;
    started.current = true;
    if (!/^[2-9A-HJKMNP-Z]{6}$/.test(code)) {
      setError('Бөлме коды қате.');
      return;
    }
    api.join(code)
      .then((view) => navigate(`/games/rooms/${view.room.room_id}`, { replace: true }))
      .catch((err) => setError(err instanceof GamesApiError ? err.message : 'Бөлмеге кіру мүмкін болмады.'));
  }, [api, code, navigate, session?.access_token]);

  return (
    <ExamScreen header={<SimpleHeader title="Бөлмеге кіру" to="/games" label="Ойындарға" />}>
      {error ? (
        <>
          <Banner tone="bad">{error}</Banner>
          <SecondaryLink to="/games">Ойындарға оралу</SecondaryLink>
        </>
      ) : (
        <LoadingBlock label="Бөлмеге кіріп жатырмыз…" />
      )}
    </ExamScreen>
  );
}

// QR-дан ашылатын бет (D46): /games/join?code=XXXXXX — бөлмеге кіріп, бірден бөлме бетіне апарады.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { BareScreen, ButtonLink, LoadingBlock, StateCard, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { GamesApiError, useGamesApi } from '@/lib/games-api';

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
    api
      .join(code)
      .then((view) => navigate(`/games/rooms/${view.room.room_id}`, { replace: true }))
      .catch((err) => setError(err instanceof GamesApiError ? err.message : 'Бөлмеге кіру мүмкін болмады.'));
  }, [api, code, navigate, session?.access_token]);

  return (
    <BareScreen header={<TopBar back="/games" backLabel="Ойындарға оралу" title="Бөлмеге кіру" />}>
      <div className="px-4 pt-2">
        {error ? (
          <StateCard mark="!" title="Бөлмеге кіру мүмкін болмады" text={error}>
            <ButtonLink to="/games">Ойындарға оралу</ButtonLink>
          </StateCard>
        ) : (
          <LoadingBlock label="Бөлмеге кіріп жатырмыз…" rows={2} />
        )}
      </div>
    </BareScreen>
  );
}

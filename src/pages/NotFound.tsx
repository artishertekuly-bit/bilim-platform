// 404 (дизайн: SystemStates.dc.html · «404»).
import { useEffect } from 'react';

import { NotFoundScreen } from '@/components/bl/SystemScreens';

export default function NotFound() {
  useEffect(() => {
    document.title = '404 · Бет табылмады · Bilim';
  }, []);
  return <NotFoundScreen />;
}

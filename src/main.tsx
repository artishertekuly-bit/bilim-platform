import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { ThemeProvider } from './components/theme/ThemeProvider';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element табылмады. index.html ішінде <div id="root"></div> болуы керек.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="bilim-theme">
      <App />
    </ThemeProvider>
  </StrictMode>
);
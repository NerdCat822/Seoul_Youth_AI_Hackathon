import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Legacy forms still return to #/. Use the same home as the main entry point.
function openHome() {
  const path = location.hash.slice(1).split('?')[0];
  if (path && path !== '/') return false;
  location.replace(new URL('design-final/home.html', location.href));
  return true;
}
if (!openHome()) {
  window.addEventListener('hashchange', openHome);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

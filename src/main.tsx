import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';

const Site = lazy(() => import('./Site'));
const configured = import.meta.env.VITE_USE_EMULATORS === 'true' ||
  ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_APP_ID'].every(key=>!!import.meta.env[key]);
createRoot(document.getElementById('root')!).render(<StrictMode>
  {configured ? <BrowserRouter><Suspense fallback={<main className="p-6">Carregando…</main>}><Site /></Suspense></BrowserRouter> :
    <main className="mx-auto max-w-xl p-8"><h1 className="text-xl font-bold">SoftwareVendasLidacom</h1>
    <p>Configure a conexão Firebase deste ambiente. Para testar localmente, use os emuladores conforme o README do projeto.</p></main>}
</StrictMode>);

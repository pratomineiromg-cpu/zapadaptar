import { useEffect, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { readAccess } from '../lib/access';
import type { User } from '../types';
import WorkQueue from './WorkQueue';
import App from '../App';
import LoginView from './LoginView';

type Session = { tenantId: string; user: User };
export default function SessionGate() {
  const [session, setSession] = useState<Session | 'loading' | 'denied' | null>('loading');
  useEffect(() => {
    let revision = 0;
    const stop = onIdTokenChanged(auth, async account => {
      const current = ++revision;
      if (!account) { setSession(null); return; }
      setSession('loading');
      try {
        const access = readAccess((await account.getIdTokenResult()).claims);
        if (current !== revision) return;
        setSession(access ? { tenantId: access.tenantId, user: {
          id: account.uid, email: account.email || '', name: account.displayName || account.email || 'Operador',
          role: access.role, active: true,
        } } : 'denied');
      } catch { if (current === revision) setSession('denied'); }
    });
    return () => { ++revision; stop(); };
  }, []);
  if (session === 'loading') return <main className="p-8">Carregando sua empresa…</main>;
  if (!session) return <LoginView />;
  if (session === 'denied') return <main className="p-8">Conta sem acesso à empresa. Solicite o vínculo ao administrador. <button onClick={() => signOut(auth)}>Sair</button></main>;
  if (['cozinha','entregador'].includes(session.user.role)) return <section key={session.user.id + session.tenantId + session.user.role}><WorkQueue kitchen={session.user.role === 'cozinha'} /></section>;
  return <App key={session.tenantId + ':' + session.user.id + ':' + session.user.role} {...session} />;
}

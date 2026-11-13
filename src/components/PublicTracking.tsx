import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { call } from '../lib/commands';

interface Tracking { orderId: string; status: string; routeStatus: string | null; courier: string | null; eta: string | null }
export default function PublicTracking() {
  const { id } = useParams();
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [message, setMessage] = useState(id ? 'Consultando pedido…' : 'Pedido não encontrado');
  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await call<Tracking>('trackOrder', { id });
        if (!active) return;
        setTracking(result); setMessage('');
        if (result.status !== 'FECHADO') timer = setTimeout(refresh, 20000);
      } catch (e) {
        if (!active) return;
        setTracking(null);
        const missing = ['functions/not-found', 'functions/invalid-argument'].includes((e as {code?: string}).code || '');
        setMessage(missing ? 'Pedido não encontrado' : 'Não foi possível consultar a entrega. Tentando novamente…');
        if (!missing) timer = setTimeout(refresh, 20000);
      }
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [id]);
  return <main className="mx-auto max-w-lg p-6 space-y-4"><h1 className="text-2xl font-bold">Acompanhar pedido</h1>
    {message && <p role="status">{message}</p>}
    {tracking && <><p>{tracking.orderId}</p><strong>{tracking.routeStatus || (tracking.status === 'PRONTO' ? 'Pronto para entrega · Aguardando entregador' : tracking.status)}</strong>
      {tracking.courier && <p>Entregador: {tracking.courier}</p>}
      {tracking.eta && <p>Previsão da rota simulada: {tracking.eta}</p>}</>}
  </main>;
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { call } from '../lib/commands';

interface Tracking {
  orderId: string; status: string; routeStatus: string | null; courier: string | null;
  eta: string | null; simulated: boolean; phone: string | null; timeline: {label:string; at:string}[];
}
const stageLabels:Record<string,string> = {'PEDIDO GERADO':'Pedido recebido','PRODUÇÃO':'Em preparo',
  'PRONTO':'Pronto para entrega · Aguardando entregador','EM ENTREGA':'Em rota','FECHADO':'Entrega concluída'};
function RouteMap({stage}:{stage:string | null}) {
  const delivered = stage === 'Pedido Entregue';
  const traveling = stage === 'Em Rota';
  return <figure className="overflow-hidden rounded-xl border border-emerald-100">
    <figcaption className="px-4 py-2 bg-emerald-50 font-semibold">Mapa simulado</figcaption>
    <svg role="img" aria-label="Trajeto ilustrativo entre o restaurante e a entrega" viewBox="0 0 320 112" className="w-full bg-stone-100">
      <defs><pattern id="streets" width="44" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
        <rect width="38" height="28" rx="4" fill="#e2e8df"/></pattern></defs>
      <rect width="320" height="112" fill="url(#streets)"/>
      <path d="M38 69 H96 L126 38 H192 L222 69 H282" stroke="#fff" strokeWidth="9" fill="none"/>
      <path d="M38 69 H96 L126 38 H192 L222 69 H282" stroke="#047857" strokeWidth="4" strokeDasharray="8 3" fill="none"/>
      <g fill="#064e3b"><circle cx="38" cy="69" r="6"/><circle cx="282" cy="69" r="6"/></g>
      {stage && <circle cx={delivered ? 282 : traveling ? 159 : 38} cy={traveling ? 38 : 69} r="9" fill="#eab308" stroke="#fff" strokeWidth="3"/>}
      <g fill="#164e38" fontSize="12" fontWeight="bold"><text x="10" y="96">Restaurante</text><text x="253" y="96">Entrega</text></g>
    </svg>
  </figure>;
}
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
    {tracking && <><section className="space-y-2 rounded-xl bg-emerald-50 p-4"><small className="break-all">{tracking.orderId}</small>
      <h2 className="text-lg font-bold text-emerald-900">{tracking.routeStatus || stageLabels[tracking.status] || tracking.status}</h2>
      {tracking.courier && <p>Entregador: {tracking.courier}</p>}
      {tracking.status !== 'FECHADO' && <p>{tracking.eta ? (tracking.simulated ? 'Previsão simulada: ' : 'Previsão: ') + tracking.eta : 'Previsão de chegada indisponível'}</p>}
      {tracking.phone && <a className="underline" href={'tel:'+tracking.phone}>Ligar para o entregador</a>}</section>
      {(tracking.simulated || import.meta.env.VITE_USE_EMULATORS === 'true') && <RouteMap stage={tracking.routeStatus}/>}
      <section><h2 className="font-bold">Histórico do pedido</h2><ol className="mt-3 space-y-2 border-l-2 border-emerald-200 pl-4">
        {tracking.timeline.map((event,index)=><li key={event.at+index}><p>{event.label}</p><time className="text-xs text-slate-600" dateTime={event.at}>
          {new Date(event.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})}
        </time></li>)}</ol></section></>}
  </main>;
}

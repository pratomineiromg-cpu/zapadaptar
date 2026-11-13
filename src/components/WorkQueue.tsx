import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { call, operate } from '../lib/commands';
type Job = {id:string; status:string; address?:string; items?:{name:string;quantity:number;size:string;notes:string;remove:string[];extras:string[]}[]};
const steps = ['Aguardando Entregador','Entregador Aceitou','Indo Retirada','Pedido Coletado','Em Rota','Pedido Entregue'];
export default function WorkQueue({kitchen}:{kitchen:boolean}) {
  const [rows,setRows]=useState<Job[]>([]),[revision,refresh]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true, timer:ReturnType<typeof setTimeout>;
    async function load() {
      try { const list=await call<Job[]>('readWorkQueue',{}); if(active){ setRows(list);setError(''); } }
      catch(e){if(active)setError(e instanceof Error?e.message:'Consulta indisponível');}
      finally{if(active)timer=setTimeout(load,15000);}
    }
    load(); return ()=>{active=false;clearTimeout(timer);};
  },[revision]);
  async function advance(job:Job,next:string){
    if(busy)return;setBusy(true);
    try{await operate(kitchen?'prepare':'routeStep',kitchen?{orderId:job.id,status:next}:{orderId:job.id,step:next});refresh(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:'Operação não confirmada');}finally{setBusy(false);}
  }
  return <main className="max-w-3xl mx-auto p-6 space-y-3"><header className="flex justify-between"><h1 className="font-bold text-xl">{kitchen?'Cozinha · Produção':'Minhas entregas'}</h1><button onClick={()=>signOut(auth)}>Sair</button></header>
    {error && <p role="alert">{error}</p>}{!rows.length && !error && <p>Sem pedidos na fila.</p>}
    {rows.map(job=>{const next=kitchen?({'PEDIDO GERADO':'PRODUÇÃO','PRODUÇÃO':'PRONTO'}[job.status]):steps[steps.indexOf(job.status)+1];
    return <article className="border rounded-xl p-4" key={job.id}><b>{job.id}</b><p>{job.status}</p>{job.address && <p>{job.address}</p>}
      {job.items?.map((i,n)=><p key={n}>{i.quantity} × {i.name} ({i.size}) {[...i.extras,...i.remove,i.notes].filter(Boolean).join(' · ')}</p>)}
      {next && <button disabled={busy} onClick={()=>advance(job,next)}>Confirmar {next}</button>}</article>;})}</main>;
}

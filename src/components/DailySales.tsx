import { useState } from 'react';
import type { Client } from '../types';
import { operate } from '../lib/commands';

export default function DailySales({clients}:{clients:Client[]}) {
  const eligible=clients.filter(c=>c.type!=='grupo' && c.type!=='bloqueado' && c.contactPreferences?.marketingStatus==='allowed' && c.contactPreferences.globalStatus!=='blocked' && /^(?:55)?\d{10,11}$/.test(c.phone.replace(/\D/g,'')));
  const [body,setBody]=useState('Olá, {nome}! Confira o cardápio de hoje.'),[excluded,setExcluded]=useState<string[]>([]),[busy,setBusy]=useState(false),[info,setInfo]=useState('');
  async function prepare(list:Client[]) {
    if(busy)return;setBusy(true);let count=0;
    try{for(const c of list){await operate('dailyDraft',{clientId:c.id,text:body.replaceAll('{nome}',c.name)});count++;}
      setInfo('Rascunhos disponíveis nas conversas: '+count);}
    catch(e){setInfo('Contatos processados: '+count+'. '+(e instanceof Error?e.message:'Falha ao preparar.'));}finally{setBusy(false);}
  }
  const selected=eligible.filter(c=>!excluded.includes(c.id));
  return <section className="p-5 space-y-4"><h2 className="text-xl font-bold">Venda Ativa diária</h2>
    <p>{clients.length} cadastrados · {eligible.length} elegíveis · {selected.length} selecionados</p>
    <textarea aria-label="Mensagem da oferta" value={body} onChange={e=>setBody(e.target.value)} className="border rounded-xl p-3 w-full" />
    <button onClick={()=>prepare(selected)} disabled={busy || !selected.length || !body.trim()}>Preparar lote de rascunhos</button>
    <p>Envio externo pendente de conexão com o provedor.</p><p role="status">{info}</p>
    {eligible.map(c=><div key={c.id} className="flex gap-3"><label><input type="checkbox" checked={!excluded.includes(c.id)} onChange={e=>setExcluded(old=>e.target.checked?old.filter(id=>id!==c.id):[...old,c.id])}/> {c.name}</label><button disabled={busy || !body.trim()} onClick={()=>prepare([c])}>Preparar individual</button></div>)}</section>;
}

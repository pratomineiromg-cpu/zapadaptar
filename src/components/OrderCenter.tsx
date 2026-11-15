import { useState } from 'react';
import type { Order, DeliveryOrder } from '../types';

export default function OrderCenter({orders,deliveries,onReceive}: {orders:Order[];deliveries:DeliveryOrder[];onReceive?:(id:string,evidence:string)=>Promise<void>}) {
  const [mode,setMode]=useState<'Lista'|'Kanban'>('Lista'), [query,setQuery]=useState('');
  const [pending,setPending]=useState(''), [error,setError]=useState('');
  const rows = new Map(orders.map(o=>[o.id,{id:o.id, name:o.clientName,total:o.total,method:String(o.paymentMethod),payment:String(o.status),stage:'Pedido gerado'}]));
  for (const d of deliveries) {
    const base=rows.get(d.id);
    const stage=d.status === 'PRONTO' ? (['mesa_qr','balcao'].includes(d.channel || '') ? 'Pronto para retirada / mesa' : d.courierId ? 'Pronto · Entregador atribuído' : 'Pronto para entrega · Aguardando entregador') : d.status === 'EM ENTREGA' ? 'Em rota' : d.status;
    rows.set(d.id,{id:d.id,name:d.clientName,total:base?.total ?? d.total,method:base?.method ?? d.paymentMethod,payment:base?.payment ?? d.financialStatus ?? 'Sem confirmação',stage});
  }
  const visible=[...rows.values()].filter(o=>(o.id+' '+o.name).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function receive(id:string) {
    const evidence=window.prompt('Informe a referência do comprovante ou do recebimento em dinheiro.');
    if (!evidence?.trim() || !onReceive || pending) return;
    setPending(id); setError('');
    try { await onReceive(id,evidence.trim()); } catch(e){setError(e instanceof Error?e.message:'Falha no recebimento.');} finally{setPending('');}
  }
  const card=(o:typeof visible[number])=><article key={o.id} className="p-3 rounded-xl border bg-white dark:bg-slate-900 space-y-1">
    <b>{o.name}</b><p className="text-xs break-all">{o.id}</p><p>{o.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · {o.method} · {o.payment}</p><p>{o.stage}</p>
    {onReceive && o.payment==='Pendente' && ['Dinheiro','Cartão','Cartão de Crédito'].includes(o.method) && <button disabled={!!pending} onClick={()=>receive(o.id)}>Registrar recebimento</button>}</article>;
  return <section className="space-y-3 p-4"><h2 className="text-xl font-bold">{onReceive?'Vendas do Caixa':'Central de Pedidos'}</h2>
    <input aria-label="Buscar pedidos" placeholder="Buscar cliente ou pedido" value={query} onChange={e=>setQuery(e.target.value)} className="border rounded-lg p-2" />
    <button className="ml-3" onClick={()=>setMode(mode==='Lista'?'Kanban':'Lista')}>Exibir {mode==='Lista'?'Kanban':'Lista'}</button>
    {error && <p role="alert">{error}</p>}{!visible.length && <p>Nenhum pedido encontrado.</p>}
    {mode==='Lista'?<div className="space-y-2">{visible.map(card)}</div>:<div className="flex gap-3 overflow-x-auto">{[...new Set(visible.map(o=>o.stage))].map(stage=><div className="min-w-56 space-y-2" key={stage}><h3>{stage}</h3>{visible.filter(o=>o.stage===stage).map(card)}</div>)}</div>}</section>;
}

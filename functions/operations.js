import { randomUUID, createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const managers = ['administrador', 'administrador_saas', 'gerente'];
const sales = [...managers, 'atendimento', 'operador', 'caixa'];
const cash = [...managers, 'caixa'];
const kitchen = [...managers, 'operador', 'cozinha'];
const permissions = {
  operatorOrder: sales, cashOpen: cash, cashMove: cash, cashClose: cash, receive: cash,
  prepare: kitchen, assign: [...managers,'operador'], routeStep: [...managers,'operador','entregador'],
  draft: sales, dailyDraft: sales, note: sales,
};
const routeSteps = ['Aguardando Entregador','Entregador Aceitou','Indo Retirada','Pedido Coletado','Em Rota','Pedido Entregue'];
function requireValue(condition, message) {
  if (!condition) throw new HttpsError('failed-precondition', message);
}
function id(value) {
  requireValue(typeof value === 'string' && /^[\w-]{1,128}$/.test(value), 'Identificador inválido.');
  return value;
}
function text(value, limit = 500) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= limit, 'Texto inválido.');
  return value.trim();
}
function cents(value) {
  requireValue(Number.isSafeInteger(value) && value >= 0 && value <= 100000000, 'Valor inválido.');
  return value;
}
function day(value) { return new Date(value).toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'}); }
export const operate = onCall(async ({auth, data}) => {
  if (!auth || !Object.hasOwn(permissions, data?.action || '') || !permissions[data.action].includes(auth.token.role))
    throw new HttpsError('permission-denied','Usuário sem permissão para a operação.');
  const db = getFirestore(), tenant = db.collection('tenants').doc(id(auth.token.tenantId));
  const {action, payload: p, requestId} = data;
  const ref = (collection, key) => tenant.collection(collection).doc(id(key));
  const token = id(requestId), actor = auth.uid, operatorName = auth.token.name || auth.token.email || actor;
  const hash = createHash('sha256').update(JSON.stringify([actor, action, p])).digest('hex');
  const command = ref('commands', token);
  const timestamp = new Date().toISOString();
  return db.runTransaction(async tx => {
    const previous = await tx.get(command);
    if (previous.exists) {
      requireValue(previous.get('hash') === hash, 'A solicitação já foi usada com outros dados.');
      return previous.get('result');
    }
    let result = {};
    const record = async (collection,key) => {
      const snap = await tx.get(ref(collection,key));
      requireValue(snap.exists, 'Registro não encontrado.');
      return snap.data();
    };
    if (action === 'operatorOrder') {
      const client = await record('clients',p.clientId);
      const settings = (await tx.get(ref('settings','default'))).data();
      requireValue(settings?.operation?.isOpen !== false, 'Operação encerrada.');
      requireValue(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= 80, 'Carrinho inválido.');
      requireValue(['Pix','Cartão de Crédito','Dinheiro','Boleto','PicPay'].includes(p.paymentMethod),'Método inválido.');
      const items = [];
      let totalCents = 0;
      for (const item of p.items) {
        const product = await record('productsDigitalMenu',item.id);
        requireValue(product.available !== false && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99, 'Produto indisponível.');
        const unitCents = cents(Math.round(product.price * 100));
        totalCents += unitCents * item.quantity;
        items.push({id:item.id, productName:product.name, quantity:item.quantity, price:unitCents / 100});
      }
      requireValue(totalCents === cents(p.expectedTotalCents),'Preço alterado. Confira o total.');
      const orderId = 'PED-' + token;
      const common = { id:orderId, tenantId:tenant.id, clientId:p.clientId, clientName:client.name, total:totalCents/100, totalCents,
        source:'operador', paymentMethod:p.paymentMethod, channel:'balcao', createdAt:timestamp, notes:String(p.notes || '').slice(0,500) };
      tx.create(ref('orders',orderId),{...common, items, status:'Pendente'});
      tx.create(ref('deliveryOrders',orderId),{...common, clientPhone:client.phone, financialStatus:'Pendente', status:'PEDIDO GERADO',
        items:items.map(i=>({productId:i.id,productName:i.productName,quantity:i.quantity,selectedSize:'Único',selectedSizePrice:i.price,
          selectedAddons:[],removedItems:[],selectedUtensils:[],subtotal:i.price*i.quantity})),
        address:{name:client.name,phone:client.phone,street:'',number:'',neighborhood:'',zipCode:''}, subtotal:common.total, deliveryFee:0, deliveryTime:'Retirada' });
      tx.create(ref('history',orderId),{id:orderId,clientId:p.clientId,type:'order_created',title:'Pedido criado',description:orderId,timestamp,operatorName});
      result = {orderId};
    } else if (['cashOpen','cashMove','cashClose','receive'].includes(action)) {
      const pointer = ref('cashRegisters','default');
      const sessionId = (await tx.get(pointer)).get('sessionId');
      if (action === 'cashOpen') {
        requireValue(!sessionId, 'Já existe turno aberto.');
        const initial = cents(p.cents)/100;
        tx.create(ref('caixaSessions',token),{id:token,operatorId:actor,operatorName,openedAt:timestamp,initialBalance:initial,
          currentBalance:initial,status:'aberto',transactions:[],createdAt:timestamp,updatedAt:timestamp});
        tx.set(pointer,{sessionId:token});
      } else {
        requireValue(sessionId && sessionId === p.sessionId,'O turno mudou. Reabra a tela do caixa.');
        const shift = await record('caixaSessions',sessionId);
        requireValue(shift.status === 'aberto','Turno fechado.');
        const shiftRef = ref('caixaSessions',sessionId);
        if (action === 'cashClose') {
          const breakdown = Object.fromEntries(['dinheiro','cartao','pix','notaFiado'].map(k=>[k,cents(p[k])/100]));
          const late = day(timestamp) !== day(shift.openedAt);
          tx.update(shiftRef,{status:'fechado',closedAt:timestamp,updatedAt:timestamp,closingBreakdown:breakdown,
            closingNotes:String(p.notes || '').slice(0,500),expectedBalance:shift.currentBalance,countedBalance:breakdown.dinheiro,
            difference:(p.dinheiro-Math.round(shift.currentBalance*100))/100,closedAsLate:late,originalOpenedAt:shift.openedAt,
            closedOperationalDate:timestamp,closingReason:late?'fechamento_atrasado':'fechamento_normal'});
          tx.set(pointer,{sessionId:null});
        } else {
          let amount, method='Dinheiro', type=p.type, description, entryId=token;
          if (action === 'receive') {
            const order = await record('orders',p.orderId);
            requireValue(order.status === 'Pendente','Pedido já liquidado ou cancelado.');
            method=order.paymentMethod;
            requireValue(['Dinheiro','Cartão','Cartão de Crédito'].includes(method),'Este método requer confirmação do provedor.');
            description=text(p.evidence); amount=cents(order.totalCents ?? Math.round(order.total*100));
            type='venda'; entryId='receipt-'+id(p.orderId);
            const projection = await tx.get(ref('deliveryOrders',p.orderId));
            tx.update(ref('orders',p.orderId),{status:'Pago',paidAt:timestamp});
            if (projection.exists) tx.update(projection.ref,{financialStatus:'Pago'});
            tx.update(ref('clients',order.clientId),{totalBought:FieldValue.increment(amount/100),lastPurchaseDate:timestamp.slice(0,10)});
          } else {
            requireValue(['entrada','saida','sangria'].includes(type),'Lançamento inválido.');
            amount=cents(p.cents); description=text(p.description);
          }
          requireValue(amount > 0,'Informe um valor positivo.');
          const delta = method !== 'Dinheiro' ? 0 : ['saida','sangria'].includes(type) ? -amount : amount;
          const entry = {id:entryId,sessionId,type,value:amount/100,valueCents:amount,method,description,timestamp,
            operatorId:actor,operatorName,...(action === 'receive'?{orderId:p.orderId,source:'order'}:{})};
          tx.create(ref('cashLedger',entryId),entry);
          tx.update(shiftRef,{currentBalance:(Math.round(shift.currentBalance*100)+delta)/100,transactions:FieldValue.arrayUnion(entry),updatedAt:timestamp});
        }
      }
    } else if (action === 'prepare' || action === 'assign' || action === 'routeStep') {
      const order = await record('deliveryOrders',p.orderId);
      const orderRef = ref('deliveryOrders',p.orderId), routeRef = ref('routes',p.orderId);
      if (action === 'prepare') {
        const allowed = {'PEDIDO GERADO':'PRODUÇÃO','PRODUÇÃO':'PRONTO'};
        const local = ['mesa_qr','balcao'].includes(order.channel);
        requireValue(allowed[order.status] === p.status || (local && order.status === 'PRONTO' && p.status === 'FECHADO'),'Transição de preparo inválida.');
        tx.update(orderRef,{status:p.status,updatedAt:timestamp});
      } else if (action === 'assign') {
        const courier = await record('couriers',p.courierId);
        requireValue(!['mesa_qr','balcao'].includes(order.channel) && order.status === 'PRONTO' && !order.courierId && courier.status === 'Disponível' && !courier.activeOrders?.length,'Pedido ou entregador indisponível.');
        tx.update(orderRef,{courierId:p.courierId});
        tx.update(ref('couriers',p.courierId),{status:'Em entrega',activeOrders:FieldValue.arrayUnion(p.orderId)});
        tx.create(routeRef,{id:p.orderId,orderId:p.orderId,courierId:p.courierId,status:routeSteps[0],updatedAt:timestamp,
          originLat:-23.5615,originLng:-46.6559,currentLat:-23.5615,currentLng:-46.6559,destLat:-23.55,destLng:-46.66,
          speedKmh:0,remainingDistance:'',remainingTime:'',alerts:[],historyCoords:[],simulated:true});
      } else {
        const route=await record('routes',p.orderId);
        requireValue(auth.token.role !== 'entregador' || (auth.token.courierId && auth.token.courierId === order.courierId), 'Entrega atribuída a outro entregador.');
        requireValue(order.courierId && route.courierId === order.courierId,'Entrega sem atribuição válida.');
        const courierRef=ref('couriers',order.courierId);
        if (p.step === 'recusar') {
          requireValue(route.status === routeSteps[0],'A rota já foi aceita.');
          tx.delete(routeRef); tx.update(orderRef,{courierId:FieldValue.delete()});
          tx.update(courierRef,{status:'Disponível',activeOrders:FieldValue.arrayRemove(p.orderId)});
        } else {
          requireValue(routeSteps.indexOf(p.step) === routeSteps.indexOf(route.status)+1 && routeSteps.includes(p.step),'Etapa de entrega inválida.');
          tx.update(routeRef,{status:p.step,updatedAt:timestamp});
          if (p.step === 'Em Rota') tx.update(orderRef,{status:'EM ENTREGA'});
          if (p.step === 'Pedido Entregue') {
            tx.update(orderRef,{status:'FECHADO',deliveredAt:timestamp});
            tx.update(courierRef,{status:'Disponível',activeOrders:FieldValue.arrayRemove(p.orderId)});
          }
        }
      }
      tx.create(ref('deliveryHistories',token),{id:token,orderId:p.orderId,action,stage:p.step || p.status || 'Entregador atribuído',createdAt:timestamp,
        ...(p.step==='Pedido Entregue'?{deliveredAt:timestamp}:{}),operatorId:actor});
    } else {
      const client = await record('clients',p.clientId);
      if (action === 'dailyDraft') {
        requireValue(client.type !== 'bloqueado' && client.type !== 'grupo' && client.contactPreferences?.globalStatus !== 'blocked' &&
          client.contactPreferences?.marketingStatus === 'allowed','Consentimento comercial necessário.');
        const phone = String(client.phone || '').replace(/\D/g,'');
        requireValue(/^(?:55)?\d{10,11}$/.test(phone), 'Telefone inválido.');
        const cycle = day(timestamp), normalized = phone.length <= 11 ? '55'+phone : phone;
        const offerId = cycle+'-'+normalized;
        const offer = ref('dailyOffers',offerId);
        if (!(await tx.get(offer)).exists) {
          const content=text(p.text,4000);
          tx.create(offer,{tenantId:tenant.id,cycle,clientId:p.clientId,status:'draft',content,createdAt:timestamp,operatorId:actor});
          tx.set(ref('messages',p.clientId),{clientId:p.clientId,items:FieldValue.arrayUnion({
            id:offerId,sender:'operador',text:'[Rascunho de Venda Ativa] '+content,timestamp,type:'text',status:'draft'
          })},{merge:true});
        }
      } else if (action === 'draft') {
        const body = text(p.text,4000);
        const item = {id:token,sender:'operador',type:'text',text:'[Rascunho] '+body,timestamp,channel:client.channel === 'rcs'?'rcs':'whatsapp',status:'draft'};
        tx.set(ref('messages',p.clientId),{clientId:p.clientId,items:FieldValue.arrayUnion(item)},{merge:true});
      } else {
        tx.create(ref('history',token),{id:token,clientId:p.clientId,type:'note_added',title:text(p.title,140),description:text(p.description,1000),timestamp,operatorName});
      }
    }
    tx.create(command,{action,actor,hash,result,createdAt:timestamp});
    return result;
  });
});
export const readWorkQueue = onCall(async ({auth}) => {
  if (!auth || !['cozinha','entregador'].includes(auth.token.role)) throw new HttpsError('permission-denied','Papel inválido.');
  const tenant=getFirestore().collection('tenants').doc(id(auth.token.tenantId));
  if (auth.token.role === 'cozinha') {
    const orders=await tenant.collection('deliveryOrders').where('status','in',['PEDIDO GERADO','PRODUÇÃO','PRONTO']).get();
    return orders.docs.map(doc=>({id:doc.id,status:doc.get('status'),items:(doc.get('items') || []).map(i=>({
      name:i.productName,quantity:i.quantity,size:i.selectedSize,notes:i.observation || '',remove:i.removedItems || [],
      extras:(i.selectedAddons || []).map(a=>a.name) }))}));
  }
  const routes=await tenant.collection('routes').where('courierId','==',id(auth.token.courierId)).get();
  return Promise.all(routes.docs.filter(r=>r.get('status')!=='Pedido Entregue').map(async route=>{
    const order=await tenant.collection('deliveryOrders').doc(id(route.get('orderId'))).get();
    const address=order.get('address');
    return {id:order.id,status:route.get('status'),address:[address.street,address.number,address.neighborhood].filter(Boolean).join(', ')};
  }));
});

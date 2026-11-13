import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { priceBasket } from '../catalog.js';

test('Preços do catálogo em centavos; item e quantidade validados', () => {
  const products = [{id:'m',name:'Marmita',price:25,tamanhos:[{label:'P',price:24}]}];
  const items = [{productId:'m',selectedSize:'P',quantity:2,price:0}];
  assert.equal(priceBasket(items, products, 5).totalCents, 5300);
  assert.throws(()=>priceBasket([{...items[0],quantity:0}],products,5));
  assert.throws(()=>priceBasket([{...items[0],selectedSize:'G'}],products,5));
});

test('Checkout, separação de empresas, crédito de cartão, logística e fechamento em transações locais',async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '',/^(localhost|127\.0\.0\.1):\d+$/);
  assert.equal(process.env.GCLOUD_PROJECT,'demo-zapadaptar');
  const { createMenuOrder,trackOrder,operate }=await import('../index.js');
  const { getFirestore }=await import('firebase-admin/firestore');
  const db=getFirestore(), tenantId='test-'+randomUUID(), tenant=db.collection('tenants').doc(tenantId);
  const ref=(area,key)=>tenant.collection(area).doc(key);
  const command=(action,payload,role='administrador',key=randomUUID(),company=tenantId)=>operate.run({
    auth:{uid:'operator',token:{tenantId:company,role}},data:{action,requestId:key,payload}});
  await Promise.all([
    ref('cardapios','almoco').set({name:'Almoço',active:true,productIds:['m']}),
    ref('productsDigitalMenu','m').set({name:'Marmita',price:24,tamanhos:[]}),
    ref('settings','default').set({operation:{isOpen:true,acceptPublicOrders:true},delivery:{defaultFee:5}}),
    ref('couriers','bike').set({name:'Rita Silva',status:'Disponível',activeOrders:[]})]);
  const data={requestId:randomUUID(),tenantId,menuId:'almoco',name:'Cliente de teste',phone:'11900000000',
    street:'Rua de teste',number:'1',neighborhood:'Centro',paymentMethod:'Cartão',expectedTotalCents:5300,
    items:[{productId:'m',quantity:2,selectedSize:'Único'}]};
  const [a,b]=await Promise.all([createMenuOrder.run({data}),createMenuOrder.run({data})]);
  assert.deepEqual(a,b);
  await ref('cardapios','almoco').update({active:false});
  assert.deepEqual(await createMenuOrder.run({data}),a);
  await assert.rejects(createMenuOrder.run({data:{...data,requestId:randomUUID()}}));
  assert.equal((await ref('orders',a.orderId).get()).get('status'),'Pendente');
  await assert.rejects(command('prepare',{orderId:a.orderId,status:'PRONTO'}));
  await assert.rejects(command('prepare',{orderId:a.orderId,status:'PRODUÇÃO'},'cozinha',randomUUID(),'unrelated'));
  await command('prepare',{orderId:a.orderId,status:'PRODUÇÃO'},'cozinha');
  await command('prepare',{orderId:a.orderId,status:'PRONTO'},'cozinha');
  await command('assign',{orderId:a.orderId,courierId:'bike'});
  assert.equal((await ref('deliveryOrders',a.orderId).get()).get('status'),'PRONTO');
  for (const step of ['Entregador Aceitou','Indo Retirada','Pedido Coletado','Em Rota','Pedido Entregue']) {
    await command('routeStep',{orderId:a.orderId,step});
  }
  assert.equal((await trackOrder.run({data:{id:a.trackingToken}})).routeStatus,'Pedido Entregue');
  assert.equal((await ref('orders',a.orderId).get()).get('status'),'Pendente');
  const sessionId=randomUUID();
  await assert.rejects(command('cashOpen',{cents:10000},'cozinha'));
  await command('cashOpen',{cents:10000},'caixa',sessionId);
  const receive={orderId:a.orderId,sessionId,evidence:'Comprovante teste'};
  const receiptId=randomUUID();
  await Promise.all([command('receive',receive,'caixa',receiptId),command('receive',receive,'caixa',receiptId)]);
  await assert.rejects(command('receive',receive,'caixa'));
  const shift=(await ref('caixaSessions',sessionId).get()).data();
  assert.equal(shift.currentBalance,100); assert.equal(shift.transactions.length,1); assert.equal(shift.transactions[0].valueCents,5300);
  await command('cashClose',{sessionId,dinheiro:10000,pix:0,cartao:5300,notaFiado:0},'caixa');
  assert.equal((await ref('caixaSessions',sessionId).get()).get('difference'),0);
  const orderPayload={clientId:'public_5511900000000',paymentMethod:'Dinheiro',notes:'Retirada',
    expectedTotalCents:4800,items:[{id:'m',quantity:2}]};
  const {orderId}=await command('operatorOrder',orderPayload,'atendimento');
  assert.equal((await ref('deliveryOrders',orderId).get()).get('channel'),'balcao');
  const clientRef=ref('clients',orderPayload.clientId);
  const daily={clientId:orderPayload.clientId,text:'Cardápio do dia'};
  await assert.rejects(command('dailyDraft',daily,'operador'));
  await clientRef.update({contactPreferences:{globalStatus:'allowed',marketingStatus:'allowed'}});
  await Promise.all([command('dailyDraft',daily,'operador'),command('dailyDraft',daily,'operador')]);
  assert.equal((await ref('messages',daily.clientId).get()).get('items').length,1);
  const {readWorkQueue}=await import('../index.js');
  const queue=await readWorkQueue.run({auth:{uid:'k',token:{role:'cozinha',tenantId}}});
  assert.ok(queue.some(row=>row.id===orderId));
  assert.ok(queue.every(row=>!('address' in row) && !('clientPhone' in row) && !('trackingToken' in row)));
  await db.terminate();
});

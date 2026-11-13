import { randomUUID, createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { priceBasket, publicProduct } from './catalog.js';

initializeApp();
const db = getFirestore();
const invalid = message => new HttpsError('invalid-argument', message);
const missing = () => new HttpsError('not-found', 'Registro não encontrado.');
const sha = value => createHash('sha256').update(value).digest('hex');
function identifier(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) throw invalid('Identificador inválido.');
  return value;
}
function field(value, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid('Confira os dados de entrega.');
  return value.trim();
}
async function resolveTenant(tx, data) {
  const menuId = identifier(data.menuId);
  const tenantId = data.tenantId ? identifier(data.tenantId)
    : (await tx.get(db.collection('publicMenuLinks').doc(menuId))).get('tenantId');
  if (!tenantId) throw missing();
  const tenant = db.collection('tenants').doc(identifier(tenantId));
  return tenant;
}
async function catalog(tx, data, tenant) {
  tenant ??= await resolveTenant(tx, data);
  const menuId = identifier(data.menuId);
  const menu = (await tx.get(tenant.collection('cardapios').doc(menuId))).data();
  if (!menu?.active) throw missing();
  const ids = [...new Set(menu.productIds || [])];
  const snapshots = ids.length ? await tx.getAll(...ids.map(id => tenant.collection('productsDigitalMenu').doc(identifier(id)))) : [];
  const settings = (await tx.get(tenant.collection('settings').doc('default'))).data();
  return { tenant, menu: { id: menuId, name: menu.name, description: menu.description || '', imageBanner: menu.imageBanner || '',
      active: true, availableHours: menu.availableHours || '', productIds: ids },
    products: snapshots.filter(s => s.exists && s.get('available') !== false).map(s => publicProduct(s.id, s.data())),
    fee: settings?.delivery?.defaultFee ?? 7, accepting: settings?.operation?.isOpen !== false && settings?.operation?.acceptPublicOrders !== false && menu.acceptOrders !== false };
}
export const readMenu = onCall(async ({ data }) => db.runTransaction(async tx => {
  const { menu, products, fee, accepting } = await catalog(tx, data);
  return { menu, products, fee, accepting };
}));
export const createMenuOrder = onCall(async ({ data }) => {
  const key = identifier(data.requestId);
  if (key.length < 32) throw invalid('Identificador de checkout inválido.');
  const name = field(data.name), phone = field(data.phone, 25).replace(/\D/g,'');
  if (!/^(?:55)?\d{10,11}$/.test(phone)) throw invalid('Telefone inválido.');
  const normalized = phone.length <= 11 ? '55' + phone : phone;
  const address = { name, phone: normalized, street: field(data.street), number: field(data.number, 20),
    neighborhood: field(data.neighborhood), complement: data.complement ? field(data.complement, 100) : '', zipCode: '' };
  if (!['Pix','Cartão','Dinheiro'].includes(data.paymentMethod)) throw invalid('Método inválido.');
  const signature = sha(JSON.stringify([data.menuId, name, normalized, address, data.paymentMethod, data.items, data.expectedTotalCents]));
  const orderId = 'PED-' + randomUUID(), trackingToken = randomUUID();
  return db.runTransaction(async tx => {
    const tenant = await resolveTenant(tx, data);
    const receipt = tenant.collection('checkoutRequests').doc(key);
    const previous = await tx.get(receipt);
    if (previous.exists) {
      if (previous.get('signature') !== signature) throw invalid('O conteúdo do checkout mudou.');
      return previous.get('response');
    }
    const { menu, products, fee, accepting } = await catalog(tx, data, tenant);
    if (!accepting) throw new HttpsError('failed-precondition', 'Recebimento de pedidos encerrado.');
    let amounts;
    try { amounts = priceBasket(data.items, products, fee); }
    catch (error) { throw invalid(error.message); }
    if (amounts.totalCents !== data.expectedTotalCents) throw new HttpsError('failed-precondition','O preço mudou. Reabra o cardápio antes de confirmar.');
    const clientId = 'public_' + normalized, client = tenant.collection('clients').doc(clientId);
    const existing = await tx.get(client);
    const createdAt = new Date().toISOString(), total = amounts.totalCents / 100;
    if (!existing.exists) tx.create(client, { id: clientId, name, phone: normalized, type: 'nao_salvo', stage: 'Pedido gerado',
      totalBought: 0, tags: [], notes: [], dispatched: false, avatarColor: 'bg-emerald-600', channel: 'delivery' });
    const common = { id: orderId, tenantId: tenant.id, clientId, clientName: name, total, totalCents: amounts.totalCents,
      paymentMethod: data.paymentMethod, channel: 'delivery', source: 'cardapio', menuId: menu.id, createdAt };
    tx.create(tenant.collection('orders').doc(orderId), { ...common, status: 'Pendente', items: amounts.items.map(i => ({
      id: i.productId, productName: i.productName, quantity: i.quantity, price: i.selectedSizePrice })) });
    tx.create(tenant.collection('deliveryOrders').doc(orderId), { ...common, ...amounts, address, clientPhone: normalized,
      subtotal: amounts.subtotalCents / 100, deliveryFee: fee, financialStatus: 'Pendente', status: 'PEDIDO GERADO', deliveryTime: 'Imediato', trackingToken });
    tx.create(tenant.collection('history').doc(orderId), { id: orderId, clientId, type: 'order_created',
      title: 'Pedido recebido pelo cardápio', description: orderId, timestamp: createdAt, operatorName: 'Sistema' });
    tx.create(tenant.collection('outbox').doc(orderId), { type: 'ORDER_CREATED', orderId, clientId, createdAt, status: 'pending' });
    tx.create(db.collection('trackingLinks').doc(trackingToken), { tenantId: tenant.id, orderId, expiresAt: Date.now() + 7*86400000 });
    const response = { orderId, trackingToken };
    tx.create(receipt, { signature, response });
    return response;
  });
});
export const trackOrder = onCall(async ({ data }) => {
  const link = (await db.collection('trackingLinks').doc(identifier(data.id)).get()).data();
  if (!link || link.expiresAt <= Date.now()) throw missing();
  const tenant = db.collection('tenants').doc(link.tenantId);
  const order = (await tenant.collection('deliveryOrders').doc(link.orderId).get()).data();
  if (!order) throw missing();
  const route = (await tenant.collection('routes').where('orderId','==',link.orderId).limit(1).get()).docs[0]?.data();
  const courierId = route?.courierId || order.courierId;
  const courier = courierId && (await tenant.collection('couriers').doc(courierId).get()).data();
  return { orderId: link.orderId, status: order.status, routeStatus: route?.status || null,
    courier: courier?.name?.split(' ')[0] || null, eta: route?.remainingTime || null };
});
export { operate, readWorkQueue } from './operations.js';

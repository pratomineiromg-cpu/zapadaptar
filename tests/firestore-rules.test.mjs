import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore,
  setDoc, terminate, updateDoc,
} from 'firebase/firestore';

test('Regras do SoftwareVendasLidacom por empresa e função', async t => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(address || '', /^(?:localhost|127\.0\.0\.1):\d+$/, 'Execute com o emulador Firestore local.');
  const [host, port] = address.split(':');
  const applications = [];
  const suffix = Date.now();
  const tenant = 'restaurant-' + suffix;
  const sessions = {};
  for (const [name, claims] of Object.entries({
    manager: { tenantId: tenant, role: 'gerente' },
    other: { tenantId: 'other-' + suffix, role: 'administrador' },
    service: { tenantId: tenant, role: 'atendimento' },
    missingRole: { tenantId: tenant },
    guest: null,
  })) {
    const app = initializeApp({ projectId: 'demo-zapadaptar', apiKey: 'demo', appId: 'demo' }, name + suffix);
    const db = initializeFirestore(app, {});
    connectFirestoreEmulator(db, host, Number(port), claims ? { mockUserToken: { sub: name, ...claims } } : {});
    applications.push({ app, db });
    sessions[name] = db;
  }
  t.after(async () => Promise.all(applications.map(async ({ app, db }) => { await terminate(db); await deleteApp(app); })));
  const path = (name, area, id) => doc(sessions[name], 'tenants', tenant, area, id);
  const segment = { id: 'seg', name: 'Recorrentes', description: 'Clientes recorrentes', active: true, createdAt: new Date().toISOString() };
  const denied = promise => assert.rejects(promise, { code: 'permission-denied' });
  await t.test('gerente pode cadastrar, editar e consultar um segmento da empresa', async () => {
    await setDoc(path('manager','commercialSegments','seg'), segment);
    await updateDoc(path('manager','commercialSegments','seg'), { description: 'Revisado' });
    assert.equal((await getDoc(path('manager','commercialSegments','seg'))).get('description'), 'Revisado');
  });
  await t.test('leitura de campanhas exige empresa e papel compatíveis', async () => {
    assert.equal((await getDoc(path('service','commercialSegments','seg'))).exists(), true);
    for (const who of ['guest','other','missingRole']) {
      await denied(getDoc(path(who,'commercialSegments','seg')));
      await denied(getDocs(collection(sessions[who], 'tenants',tenant,'commercialSegments')));
    }
  });
  await t.test('edição de campos e perfis respeita os limites do cadastro', async () => {
    await denied(updateDoc(path('manager','commercialSegments','seg'), { createdAt: 'alterada' }));
    await denied(updateDoc(path('manager','commercialSegments','seg'), { name: '' }));
    await denied(updateDoc(path('service','commercialSegments','seg'), { active: false }));
  });
  await t.test('pedidos, caixa, eventos, links e privilégios só recebem gravação do backend', async () => {
    for (const area of ['orders','deliveryOrders','caixaSessions','outbox','history','members','trackingLinks']) {
      await denied(setDoc(path('manager',area,'x'), { id: 'x' }));
    }
    await denied(getDocs(collection(sessions.manager,'trackingLinks')));
  });
});

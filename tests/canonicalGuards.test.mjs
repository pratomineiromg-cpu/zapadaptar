import test from 'node:test';
import assert from 'node:assert/strict';
import {
  externalOrderReferenceKey,
  sameExternalOrderReference,
  validateCanonicalOrderIdentity,
  ordersShareExternalReference,
  parseZonedTimestamp,
  validateCommercialContentValidity,
} from '../src/domain/canonicalGuards.ts';

const reference = (overrides = {}) => ({
  tenantId: 'restaurant-1', sourceSystem: 'META_OFFICIAL', channel: 'WHATSAPP', externalId: 'msg-0001', ...overrides,
});
const order = (overrides = {}) => ({
  tenantId: 'restaurant-1', orderId: 'order-uuid-1', orderNumber: 1048,
  origin: { entryPoint: 'CHAT', channel: 'WHATSAPP', provider: 'META_OFFICIAL' },
  externalReferences: [reference()], ...overrides,
});

test('valid canonical order identity passes', () => assert.deepEqual(validateCanonicalOrderIdentity(order()), []));
test('missing order ID is rejected', () => assert.ok(validateCanonicalOrderIdentity(order({ orderId: '   ' })).includes('missing-order-id')));
test('missing tenant ID is rejected', () => assert.ok(validateCanonicalOrderIdentity(order({ tenantId: '' })).includes('missing-tenant-id')));
test('order number must be a positive safe integer', () => {
  for (const orderNumber of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(validateCanonicalOrderIdentity(order({ orderNumber })).includes('invalid-order-number'));
  }
});
test('web-created public menu order is correctly classified as WEB', () => {
  assert.deepEqual(validateCanonicalOrderIdentity(order({ origin: { entryPoint: 'PUBLIC_MENU', channel: 'WEB' } })), []);
});
test('public-menu checkout labeled WhatsApp is rejected', () => {
  assert.ok(validateCanonicalOrderIdentity(order({ origin: { entryPoint: 'PUBLIC_MENU', channel: 'WHATSAPP' } })).includes('invalid-public-menu-origin'));
});
test('chat must originate in WhatsApp or RCS', () => {
  assert.ok(validateCanonicalOrderIdentity(order({ origin: { entryPoint: 'CHAT', channel: 'WEB' } })).includes('invalid-chat-origin'));
});
test('RCS cannot use WhatsApp Meta provider', () => {
  assert.ok(validateCanonicalOrderIdentity(order({ origin: { entryPoint: 'CHAT', channel: 'RCS', provider: 'META_OFFICIAL' } })).includes('invalid-origin-provider'));
});
test('Evolution is WhatsApp provider and not a customer channel', () => {
  assert.deepEqual(validateCanonicalOrderIdentity(order({ origin: { entryPoint: 'CHAT', channel: 'WHATSAPP', provider: 'EVOLUTION' } })), []);
});
test('duplicate external references within same order are rejected', () => {
  assert.ok(validateCanonicalOrderIdentity(order({ externalReferences: [reference(), reference()] })).includes('duplicate-external-reference'));
});
test('cross-tenant external reference is rejected', () => {
  assert.ok(validateCanonicalOrderIdentity(order({ externalReferences: [reference({ tenantId: 'restaurant-2' })] })).includes('external-tenant-mismatch'));
});
test('external reference identity preserves zeros, case and whitespace', () => {
  assert.notEqual(externalOrderReferenceKey(reference({ externalId: '0001' })), externalOrderReferenceKey(reference({ externalId: '1' })));
  assert.notEqual(externalOrderReferenceKey(reference({ externalId: 'A' })), externalOrderReferenceKey(reference({ externalId: 'a' })));
  assert.notEqual(externalOrderReferenceKey(reference({ externalId: ' x ' })), externalOrderReferenceKey(reference({ externalId: 'x' })));
});
test('reference encoding cannot collide through delimiters', () => {
  assert.notEqual(externalOrderReferenceKey(reference({ sourceSystem: 'a|b', externalId: 'c' })), externalOrderReferenceKey(reference({ sourceSystem: 'a', externalId: 'b|c' })));
});
test('same reference must match scoped source, channel and tenant', () => {
  assert.ok(sameExternalOrderReference(reference(), reference()));
  assert.equal(sameExternalOrderReference(reference(), reference({ sourceSystem: 'EVOLUTION' })), false);
  assert.equal(sameExternalOrderReference(reference(), reference({ tenantId: 'restaurant-2' })), false);
  assert.equal(sameExternalOrderReference(reference(), reference({ channel: 'RCS' })), false);
});
test('retry of same external event across distinct orders is detected', () => {
  assert.equal(ordersShareExternalReference(order(), order({ orderId: 'order-uuid-2', orderNumber: 1049 })), true);
});
test('different events from same customer can create distinct orders', () => {
  assert.equal(ordersShareExternalReference(order(), order({ orderId: 'order-uuid-2', orderNumber: 1049, externalReferences: [reference({ externalId: 'msg-0002' })] })), false);
});
test('no source reference never implies same order', () => {
  assert.equal(ordersShareExternalReference(order({ externalReferences: [] }), order({ externalReferences: [] })), false);
});
test('ISO timestamp must contain date, seconds and explicit zone', () => {
  assert.equal(parseZonedTimestamp('2026-10-27T00:01:00-03:00') !== null, true);
  assert.equal(parseZonedTimestamp('2026-10-27T00:01:00Z') !== null, true);
  assert.equal(parseZonedTimestamp('2026-10-27T00:01') , null);
  assert.equal(parseZonedTimestamp('2026-10-27T00:01:00') , null);
});
test('invalid calendar dates and invalid offsets are rejected', () => {
  assert.equal(parseZonedTimestamp('2026-02-29T00:00:00Z'), null);
  assert.equal(parseZonedTimestamp('2026-13-01T00:00:00Z'), null);
  assert.equal(parseZonedTimestamp('2026-10-27T00:00:00+15:00'), null);
});
test('valid daily and date-range contract accepts explicit bounded intervals', () => {
  assert.deepEqual(validateCommercialContentValidity({ policy: 'DAILY', validFromAt: '2026-10-27T00:00:00-03:00', commercialExpiresAt: '2026-10-28T00:01:00-03:00' }), []);
  assert.deepEqual(validateCommercialContentValidity({ policy: 'DATE_RANGE', validFromAt: '2026-10-01T00:00:00-03:00', commercialExpiresAt: '2026-11-01T00:00:00-03:00' }), []);
});
test('expiry before or equal to start is rejected', () => {
  const at = '2026-10-27T00:00:00Z';
  assert.ok(validateCommercialContentValidity({ policy: 'DAILY', validFromAt: at, commercialExpiresAt: at }).includes('invalid-interval'));
  assert.ok(validateCommercialContentValidity({ policy: 'DAILY', validFromAt: at, commercialExpiresAt: '2026-10-26T23:59:00Z' }).includes('invalid-interval'));
});
test('invalid timestamp is not silently interpreted in local browser timezone', () => {
  assert.ok(validateCommercialContentValidity({ policy: 'DATE_RANGE', validFromAt: '2026-10-27', commercialExpiresAt: '2026-10-28T00:00:00Z' }).includes('invalid-valid-from'));
});

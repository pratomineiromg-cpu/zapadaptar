/** ZA-01 — Validadores puros, sem I/O ou efeitos colaterais. */
import type {
  CanonicalChannel,
  CanonicalOrderIdentity,
  CommercialContentValidity,
  ExternalOrderReference,
  MessagingProvider,
} from './canonicalContracts';

export type CanonicalContractIssue =
  | 'missing-tenant-id'
  | 'missing-order-id'
  | 'invalid-order-number'
  | 'invalid-origin-provider'
  | 'invalid-public-menu-origin'
  | 'invalid-chat-origin'
  | 'missing-external-reference-field'
  | 'external-tenant-mismatch'
  | 'duplicate-external-reference';

const PROVIDER_CHANNEL: Record<MessagingProvider, CanonicalChannel> = {
  META_OFFICIAL: 'WHATSAPP',
  EVOLUTION: 'WHATSAPP',
  GOOGLE_RCS: 'RCS',
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A chave representa a identidade externa sem colisões por separadores:
 * JSON serializa o array de componentes com delimitação não ambígua.
 * Preserve caixa, espaços e zeros à esquerda dos identificadores externos.
 */
export function externalOrderReferenceKey(ref: ExternalOrderReference): string {
  return JSON.stringify([ref.tenantId, ref.sourceSystem, ref.channel, ref.externalId]);
}

export function sameExternalOrderReference(
  left: ExternalOrderReference,
  right: ExternalOrderReference,
): boolean {
  return externalOrderReferenceKey(left) === externalOrderReferenceKey(right);
}

export function validateCanonicalOrderIdentity(identity: CanonicalOrderIdentity): CanonicalContractIssue[] {
  const issues: CanonicalContractIssue[] = [];
  if (!nonEmptyString(identity.tenantId)) issues.push('missing-tenant-id');
  if (!nonEmptyString(identity.orderId)) issues.push('missing-order-id');
  if (!Number.isSafeInteger(identity.orderNumber) || identity.orderNumber <= 0) {
    issues.push('invalid-order-number');
  }

  const { origin } = identity;
  if (origin.provider && PROVIDER_CHANNEL[origin.provider] !== origin.channel) {
    issues.push('invalid-origin-provider');
  }
  if (origin.entryPoint === 'PUBLIC_MENU' && origin.channel !== 'WEB') {
    issues.push('invalid-public-menu-origin');
  }
  if (origin.entryPoint === 'CHAT' && origin.channel !== 'WHATSAPP' && origin.channel !== 'RCS') {
    issues.push('invalid-chat-origin');
  }

  const seen = new Set<string>();
  for (const ref of identity.externalReferences) {
    if (!nonEmptyString(ref.tenantId) || !nonEmptyString(ref.sourceSystem) || !nonEmptyString(ref.externalId)) {
      issues.push('missing-external-reference-field');
      continue;
    }
    if (ref.tenantId !== identity.tenantId) issues.push('external-tenant-mismatch');
    const key = externalOrderReferenceKey(ref);
    if (seen.has(key)) issues.push('duplicate-external-reference');
    seen.add(key);
  }
  return [...new Set(issues)];
}

/** Detecta referência externa compartilhada entre pedidos diferentes. */
export function ordersShareExternalReference(
  left: CanonicalOrderIdentity,
  right: CanonicalOrderIdentity,
): boolean {
  const leftKeys = new Set(left.externalReferences.map(externalOrderReferenceKey));
  return right.externalReferences.some((ref) => leftKeys.has(externalOrderReferenceKey(ref)));
}

/** Exige data/hora ISO 8601 com fuso, sem inventar timezone na UI. */
export function parseZonedTimestamp(value: string): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw, hhRaw, mmRaw, ssRaw, zone] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  const ss = Number(ssRaw);
  if (month < 1 || month > 12 || hh > 23 || mm > 59 || ss > 59) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  if (zone !== 'Z') {
    const zoneHours = Number(zone.slice(1, 3));
    const zoneMinutes = Number(zone.slice(4, 6));
    if (zoneHours > 14 || zoneMinutes > 59 || (zoneHours === 14 && zoneMinutes !== 0)) return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type CommercialValidityIssue = 'invalid-valid-from' | 'invalid-expires-at' | 'invalid-interval';

/** Somente contrato temporal. A política DAILY completa será introduzida na ZA-02. */
export function validateCommercialContentValidity(validity: CommercialContentValidity): CommercialValidityIssue[] {
  const issues: CommercialValidityIssue[] = [];
  const start = parseZonedTimestamp(validity.validFromAt);
  const end = parseZonedTimestamp(validity.commercialExpiresAt);
  if (start === null) issues.push('invalid-valid-from');
  if (end === null) issues.push('invalid-expires-at');
  if (start !== null && end !== null && end <= start) issues.push('invalid-interval');
  return issues;
}

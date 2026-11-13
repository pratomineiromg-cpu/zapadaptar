import type { UserRole } from '../types';

const roles: UserRole[] = ['administrador', 'gerente', 'operador', 'atendimento', 'cozinha', 'caixa', 'entregador', 'administrador_saas'];

export function readAccess(claims: Record<string, unknown>) {
  const { tenantId, role } = claims;
  if (typeof tenantId !== 'string' || !/^[\w-]{1,96}$/.test(tenantId) || !roles.includes(role as UserRole)) return null;
  return { tenantId, role: role as UserRole };
}

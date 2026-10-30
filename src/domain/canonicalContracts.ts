/**
 * ZA-01 — Contratos canônicos aditivos.
 * Estes tipos NÃO substituem src/types.ts nem migram dados existentes.
 * São uma fronteira para os futuros adaptadores da aplicação.
 */

/** Canal percebido pelo cliente, independente do provedor de transporte. */
export type CanonicalChannel = 'WHATSAPP' | 'RCS' | 'WEB' | 'IN_PERSON' | 'PHONE';

/** Provedor de transporte, não canal nem fonte obrigatória de pedidos. */
export type MessagingProvider = 'META_OFFICIAL' | 'EVOLUTION' | 'GOOGLE_RCS';

/** Forma de criação do pedido; não confundir com o canal de comunicação. */
export type OrderEntryPoint = 'CHAT' | 'OPERATOR' | 'PUBLIC_MENU' | 'TABLE_QR' | 'API';

export interface OrderOrigin {
  entryPoint: OrderEntryPoint;
  channel: CanonicalChannel;
  provider?: MessagingProvider;
}

/**
 * Identifica o mesmo pedido quando uma integração repete um evento.
 * sourceSystem identifica o namespace externo (ex.: META_OFFICIAL ou marketplace X).
 * O ID externo é opaco: não deve ser convertido, normalizado ou substituído.
 */
export interface ExternalOrderReference {
  tenantId: string;
  sourceSystem: string;
  channel: CanonicalChannel;
  externalId: string;
}

/**
 * orderId é gerado de modo globalmente único no backend; orderNumber é
 * atribuído de modo transacional, no escopo do estabelecimento.
 * Funções de UI NÃO devem inventar nenhum desses identificadores.
 */
export interface CanonicalOrderIdentity {
  tenantId: string;
  orderId: string;
  orderNumber: number;
  origin: OrderOrigin;
  externalReferences: readonly ExternalOrderReference[];
}

/** Estados independentes: um pagamento não implica conclusão da produção. */
export type CanonicalOrderStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type CanonicalPaymentStatus = 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'REFUNDED' | 'FAILED';
export type CanonicalProductionStatus = 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DISPATCHED';
export type CanonicalDeliveryStatus = 'NOT_APPLICABLE' | 'AWAITING_DRIVER' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

/** Estado comercial separado dos quatro estados operacionais do pedido. */
export type CanonicalFunnelStage =
  | 'RASCUNHO' // Compatibilidade com o funil de 10 fases existente.
  | 'LEAD'
  | 'EM_ATENDIMENTO'
  | 'PEDIDO_GERADO'
  | 'AGUARDANDO_PAGAMENTO'
  | 'PAGO'
  | 'PRODUCAO'
  | 'ENTREGUE'
  | 'FECHADO'
  | 'POS_VENDA';

export interface CanonicalOrderLifecycle {
  orderStatus: CanonicalOrderStatus;
  paymentStatus: CanonicalPaymentStatus;
  productionStatus: CanonicalProductionStatus;
  deliveryStatus: CanonicalDeliveryStatus;
  funnelStage: CanonicalFunnelStage;
}

/**
 * Instantes ISO 8601 com fuso explícito (Z ou +/-HH:MM).
 * DAILY / DATE_RANGE expressam validade comercial, NÃO entrega de mensagens.
 * A definição de horário local do estabelecimento ocorrerá na ZA-02.
 */
export type CommercialValidityPolicy = 'DAILY' | 'DATE_RANGE';
export interface CommercialContentValidity {
  policy: CommercialValidityPolicy;
  validFromAt: string;
  commercialExpiresAt: string;
}

/**
 * Janela do provedor é separada do relógio comercial.
 * A mera existência de uma mensagem simulada NÃO é evidência de inbound.
 * O cálculo de janelas por provedor será introduzido na ZA-02.
 */
export interface VerifiedCustomerInbound {
  provider: MessagingProvider;
  providerMessageId: string;
  receivedAt: string;
  evidence: 'VERIFIED_PROVIDER_EVENT';
}

export interface CustomerServiceWindow {
  channel: CanonicalChannel;
  provider?: MessagingProvider;
  lastVerifiedInbound?: VerifiedCustomerInbound;
  customerServiceWindowExpiresAt?: string;
}

/** Registro de execução planejada. Uma aprovação não significa envio efetuado. */
export type ActiveSaleMode = 'BATCH' | 'INDIVIDUAL';
export type ActiveSaleExecutionStatus = 'DRAFT' | 'PREPARED' | 'AUTHORIZED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export interface ActiveSaleRunIdentity {
  tenantId: string;
  runId: string;
  offerId: string;
  mode: ActiveSaleMode;
  status: ActiveSaleExecutionStatus;
  authorizedBy?: string;
  authorizedAt?: string;
}

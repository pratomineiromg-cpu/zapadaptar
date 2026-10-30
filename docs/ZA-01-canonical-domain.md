# ZA-01 — Contratos canônicos aditivos

## Escopo

Esta fase prepara a evolução de **pratomineiromg-cpu/zapadaptar** sem substituir seus modelos legados. Não há mudança de UI, gravação Firestore, alteração de pedido, integração real de mensagens, deploy ou migração.

Baseline: main no commit 26ff822002e5e7a9237eaa707c3395485ce13c0c.

## Precedência das referências

1. Instruções atuais do produto: evoluir ZapAdaptar.
2. Prompt original do Protótipo B (34 seções): regras funcionais prioritárias.
3. Relatório de engenharia reversa do Protótipo B: implementação simulada e referência de arquitetura.
4. Código existente do ZapAdaptar: preservar compatibilidade e histórico.

## Contratos introduzidos

- Canal separado de provedor: WHATSAPP, RCS, WEB, IN_PERSON, PHONE versus META_OFFICIAL, EVOLUTION, GOOGLE_RCS.
- Origem de pedido independente de canal. PUBLIC_MENU exige WEB, mesmo quando houver futura notificação via WhatsApp.
- Identidade de pedido: tenantId, orderId, orderNumber, origin e externalReferences.
- Referência externa identificada por tenantId + sourceSystem + channel + externalId, sem transformar os IDs opacos.
- Estados distintos de pedido, pagamento, produção, entrega e funil. RASCUNHO permanece disponível para compatibilidade.
- Conteúdo comercial DAILY/DATE_RANGE com timestamps e fuso explícito, separado da janela de atendimento.
- Janela de conversa com evidência de mensagem recebida verificada pelo provedor; simulação não é evento verificado.
- Identidade de execução da Venda Ativa em modo BATCH/INDIVIDUAL com autorização explícita representável.

## O que os validadores fazem

Validam origem e identidade de pedido, incompatibilidade canal/provedor, referência externa duplicada, isolamento de tenant, formatação de datas com timezone e coerência dos intervalos comerciais. São funções puras.

A função ordersShareExternalReference detecta conflito em memória, mas NÃO reserva identificadores ou estabelece idempotência persistente entre transações.

## Migração e limites da ZA-01

Os dados existentes com IDs PED-XXXX e DEL-XXXX não são renumerados, alterados ou apagados. A atribuição de orderId e orderNumber canônicos deverá ocorrer em backend transacional nas fases futuras. Os modelos de interface existentes permanecem intactos.

O cálculo do relógio comercial DAILY e das políticas WhatsApp/RCS de atendimento será realizado na ZA-02, após validação dos requisitos oficiais e do fuso do estabelecimento. O limite de 250 contatos é parâmetro operacional de exemplo, não cota oficial dos provedores.

## Comandos de validação

Após instalar as dependências:

    npm run test:domain
    npm run lint
    npm run build

O teste de domínio usa node --import tsx --test, com tsx já declarado em devDependencies.

## Critérios de aprovação

1. Revisão do diff e ausência de alterações fora destes arquivos aditivos.
2. Testes de domínio, TypeScript e build aprovados no ambiente completo.
3. Confirmação de nenhum efeito colateral na UI, dados, integrações ou hospedagem.
4. PR DRAFT sem merge na main até aprovação expressa.

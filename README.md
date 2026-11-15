# SoftwareVendasLidacom

Adaptação do site do AI Studio a partir de `main@26ff822`. O incremento integra autenticação por empresa, cardápio público, pedido expresso, preparação, despacho, consulta de rastreio, lançamento de caixa e rascunho de Venda Ativa. As telas GreenHub e as dez colunas do CRM são reaproveitadas.

## Executar em ambiente local

Use Node.js 22, Java 21 e Firebase CLI. Na raiz do repositório:

```powershell
npm ci
npm ci --prefix functions
Copy-Item .env.example .env.local
```

Em `.env.local`, defina `VITE_USE_EMULATORS=true`. O frontend usa o projeto isolado `demo-zapadaptar`. Inicie o servidor dos emuladores em um terminal e o frontend em outro:

```powershell
firebase emulators:start --project demo-zapadaptar --only "auth,firestore,functions"
```

```powershell
npm run dev
```

Para criar o restaurante, um usuário administrativo e um cardápio **exclusivamente nos emuladores**, execute em outro terminal:

```powershell
$env:GCLOUD_PROJECT='demo-zapadaptar'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
node functions/scripts/seed-local.js
```

O comando imprime o login local. Abra `http://localhost:3000/cardapio/prato-mineiro/almoco`, crie um pedido e siga o link de acompanhamento. Na interface administrativa, consulte Pedidos, Cozinha, Gestão de Entregas e Caixa. A rota anterior `/cardapio/:menuId` requer um vínculo `publicMenuLinks/{menuId}.tenantId` criado pelo backend.

## Contratos de operação

- As claims assinadas `tenantId` e `role` controlam o acesso. O entregador precisa também de `courierId`. Contas e registros globais da versão anterior precisam ser associados à empresa por procedimento administrativo. O site não migra nem atribui privilégios automaticamente.
- `createMenuOrder` calcula os preços do catálogo em centavos. O pedido comercial e a projeção para preparo e entrega são gravados em uma transação com o mesmo ID. Uma repetição do checkout retorna o primeiro resultado. O link de rastreamento expira em sete dias.
- A cozinha recebe uma projeção com itens e personalizações. O entregador consulta as rotas atribuídas a ele. Atribuir, aceitar, coletar, sair e entregar são ações distintas. A confirmação da entrega não contabiliza pagamento.
- O operador usa o catálogo da empresa para pedidos expressos de retirada. O caixa registra dinheiro e cartão mediante referência informada. Pix permanece pendente até a integração com o PSP. A conciliação de gaveta inclui só dinheiro.
- O atendimento salva rascunhos. A Venda Ativa verifica consentimento e deduplica a oferta diária por telefone. O lote nesta versão prepara rascunhos nas conversas. A entrega de mensagens depende do conector.
- O projeto Firebase real exige configuração explícita em `VITE_FIREBASE_*`. A configuração de Hosting existente não publica a aplicação ao executar build.

## Verificação

```powershell
npm run lint
npm run build
.\node_modules\.bin\tsc.cmd -p backend/dispatch-admission/tsconfig.json
node --test backend/dispatch-admission/tests/admission.test.mjs
```

Com o emulador Firestore ativo e as regras de `firestore.rules` carregadas:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:GCLOUD_PROJECT='demo-zapadaptar'
node --test functions/test/operations.test.js tests/firestore-rules.test.mjs
```

## Cobertura restante do prompt mestre

| Área | Trabalho necessário antes de homologar a plataforma completa |
|---|---|
| SaaS | Onboarding real, gestão de usuários e de várias empresas, planos, cobrança, limites e migração reconciliada do banco anterior. |
| Pedidos e salão | Esgotamento por ingrediente, agendamento, validação da vigência, PDV completo, mesa/QR e divisão de contas no núcleo transacional. |
| Financeiro | PSP Pix e webhook, pagamentos parciais, estornos, convênio/fiado, conciliação e trilha completa de recebimentos. |
| Atendimento e automação | Evolution e RCS, homologação dos canais, fila durável de envio, webhooks, estados verificáveis, IA de pedidos e escalonamento. |
| Operação | Telemetria real autorizada, ETA e mapa reais, spooler e impressão ESC/POS, satisfação, métricas derivadas de eventos e substituição de simulações remanescentes. |
| Publicação | Testar a versão integral em ambiente separado, rever permissões, aprovar a publicação e validar primeiro no Prato Mineiro. O aceite do restaurante precede a abertura ao mercado. |

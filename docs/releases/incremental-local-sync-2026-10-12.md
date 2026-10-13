# Correção de leituras Web — 2026-10-12

Branch fix/incremental-local-sync em worktree dedicada baseada em origin/main f322dd3. Checkout principal preservado, sem deploy/dados de produção.

## Implementado

- Materialização IndexedDB por usuário/ambiente com checkpoint atômico, Web Locks e proteção contra cursor regressivo.
- Observadores locais para calendário, todos relatórios inclusive tópicos, projetos, listas/pendências, detalhe de registro e auditoria.
- Um listener de head por sessão focada; pausa em blur/hidden, retomada incremental. Navegação não inicia sincronização.
- Journal/ledger/geração ACL duráveis via triggers; callable lê apenas deltas e hidrata estado canônico atual, nunca payload histórico.
- Bootstrap inicial paginado; rebootstrap só projeto novo/geração ACL alterada. Limites/gaps falham explicitamente.
- Retries conectados à sincronização global; falha de IndexedDB não causa fallback remoto.
- Counters console.debug sem conteúdo pessoal permitem comparar navegação, reload e retomada.

## Validação

Testes de regressão: zero Firebase onSnapshot/getDocs/httpsCallable nos observers; reload e 30 observações sem bootstrap adicional; deletes durante bootstrap, paginação physical cursor, ACL/grant/recreate, erros persistência/pull, cancelamento logout/foco; audit own/current ACL e journal late/retries/gaps/payload budgets. npm run check passou (exit0): Prettier, ESLint, TypeScript, testes e builds. git diff --check passou. 949 testes/checks completos passaram; CI remoto aprovado. Além dos mocks, validação real descrita abaixo.

Em 2026-10-13, com autorização humana, Docker projeto worktrack-incremental-local-sync iniciou na própria worktree, com volumes exclusivos: frontend5191/Auth9121/Firestore8101/Functions5021/UI4021. Vite ready/HMR connected; All emulators ready e callable/triggers carregados. http://localhost:5191 disponível para validação humana, somente demo-work-track e contas sintéticas. Nenhum outro serviço foi parado. Ambiente mantido até autorização de encerramento.

Navigator/Playwright: login Google emulado, dashboard calculado e calendário/registros funcionais, zero erros de console (aviso meta mobile preexistente). IndexedDB real armazenou7 projetos/44 registros/cursor0. 30 mudanças de período e navegação relatório/registros geraram ZERO chamadas syncWorkspace. Reload fez2 deltas cursor0/head0 e ZERO bootstrap. Criação sintética pelo REST Admin do emulador foi recebida pelo trigger/head/callable e persistida: cursor1/45 registros; hard delete real retirou documento: cursor2/44 registros. Alteração de metadados gerou delta sem bootstrap. Teste de foco via hasFocus false+blur manteve sem novo delta enquanto pausado; restaurar foco retomou do cursor. Testes reais de Rules executados em processo Java isolado dentro do container:12 passaram, incluindo journal/ledger/gerações privados e head readonly. Não são métricas de faturamento de produção.

## Operação

Backend/regras/triggers devem ser publicados antes frontend. Primeiro uso transfere snapshot inicial; reload normal busca somente catálogo/head e deltas. Triggers são eventualmente consistentes, não outbox atômico; atraso de publicação não é certificado pelo head. Cache perdido/projeto recém-concedido requer bootstrap. Journal/ledger sem TTL, monitorar crescimento/head contention. Custo não é zero: sincronização e escritas do journal continuam cobradas, mas não há varredura de histórico por filtro/data.

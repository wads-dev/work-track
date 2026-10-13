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

Testes de regressão: zero Firebase onSnapshot/getDocs/httpsCallable nos observers; reload e 30 observações sem bootstrap adicional; deletes durante bootstrap, paginação physical cursor, ACL/grant/recreate, erros persistência/pull, cancelamento logout/foco; audit own/current ACL e journal late/retries/gaps/payload budgets. npm run check passou (exit0): Prettier, ESLint, TypeScript, testes e builds. git diff --check passou. Docker/visual/Rules/IndexedDB reais continuam pendentes abaixo; testes de SDK são mocks.

Docker projeto worktrack-incremental-local-sync configurado localmente e ignorado, frontend5191/Auth9121/Firestore8101/Functions5021/UI4021. Nenhum container iniciou: buildx requer acesso fora workspace; solicitações de aprovação expiraram. URL pretendida http://localhost:5191 não está disponível. Não houve validação visual, Rules em emulador ou teste real de IndexedDB/Firestore neste ambiente. Nenhum outro serviço foi parado.

## Operação

Backend/regras/triggers devem ser publicados antes frontend. Primeiro uso transfere snapshot inicial; reload normal busca somente catálogo/head e deltas. Triggers são eventualmente consistentes, não outbox atômico; atraso de publicação não é certificado pelo head. Cache perdido/projeto recém-concedido requer bootstrap. Journal/ledger sem TTL, monitorar crescimento/head contention. Custo não é zero: sincronização e escritas do journal continuam cobradas, mas não há varredura de histórico por filtro/data.

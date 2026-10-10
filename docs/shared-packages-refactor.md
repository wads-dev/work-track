# Refatoração de pacotes compartilhados

## Objetivo

Extrair o núcleo neutro e repositórios reutilizáveis da main `393c78b`, incorporando a correção posterior `7d7c652` sem alterar contratos públicos, permissões, dados persistidos ou algoritmos. Trabalho na branch/worktree `refactor-shared-core-data`.

## Fronteiras

- `@work-track/core`: domínio, modelos, schemas, contratos e aplicação independente de SDK/transporte. Não depende de apps, Firebase, React, Express ou Node runtime.
- `@work-track/data`: codecs de persistência, portas de leitura e repositórios sobre documentos/snapshots. Depende somente de core e Zod.
- Backend: identidade autoritativa, OAuth, HTTP/MCP/Callable, transações Admin, auditoria, idempotência e diretório de usuários.
- Frontend: React, ViewModels, assinaturas Web, metadados de cache, descarte por sessão e gateway Callable.
- Não haverá uma porta transacional Web/Admin universal nem alterações de Security Rules nesta refatoração.

## Sequência

1. Validar referência limpa e documentar testes.
2. Extrair domínio e aplicação pura para core e atualizar imports por exports explícitos.
3. Separar modelos/schemas/contratos e unificar tipos repetidos.
4. Extrair snapshots, codecs e porta de leitura limitada para data, com adaptadores usados de fato.
5. Organizar frontend em features, infraestrutura, sources, cache e UI comum; preservar testes.
6. Adaptar build/artefato isolado de Functions, npm workspaces, Docker e CI.
7. Adicionar testes de fronteira, serialização, paridade e artefato standalone.
8. Validar `npm run check`, `git diff --check` e navegador em Docker/emuladores isolados.
9. Abrir PR e manter ambiente disponível até autorização explícita para encerrar.

## Cuidados de compatibilidade

Schemas de escrita não substituem decoders tolerantes de leitura. Ausência/null de `endedAt`, tombstones, aliases, tipos legados e normalização de metadados mantêm sua semântica. Os modos históricos de leitura de tópicos permanecem explícitos. Dados de relatórios completos não são substituídos por primeira página ou cache parcial. Comandos e acesso ao diretório Auth permanecem no servidor.

## Progresso

- Worktree criada em origin/main `393c78b`; checkout principal preservado.
- Referência completa `npm run check`: exit 0; 470 testes backend, 256 frontend e 4 testes do gerador.
- Extração inicial core: 54 arquivos movidos; 146 testes core, 324 backend e 256 frontend passaram (726 testes preservados).
- Snapshots, codecs e catálogo extraídos para data; frontend reorganizado por funcionalidades, sources, cache e infraestrutura. Gateway Callable centraliza chamadas sem substituir comandos por writes diretos.
- Instalação limpa `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check` e `git diff --check` passaram após rebase em origin/main `7d7c652`; testes de packaging verificaram instalação fora do workspace e descoberta oficial do Firebase Functions, incluindo o alias legado moveSubject.
- Testes atuais: core146/data28/backend327/frontend263 +12 scripts Node, antes da regressão adicional de apresentação calendário.
- Reviews independentes: sem regressão funcional bloqueante; gate backend corrigido para testar core/data antes de publicar.
- Validação Docker/browser pendente: buildx precisa gravar em ~/.docker fora do sandbox; solicitações de aprovação expiraram. Nenhum container foi iniciado.
- Portas reservadas localmente: frontend5184/Auth9114/Firestore8094/Functions5014/UI4014; projeto Compose worktrack-refactor-shared-core-data. .env.worktree ignorado.
- Não houve deploy de produção, alterações de regras/índices, dados, permissões ou algoritmos.

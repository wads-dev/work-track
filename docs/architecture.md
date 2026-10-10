# Arquitetura

Monorepo npm com duas aplicações e dois pacotes internos. As aplicações não importam código uma da outra; usam subpaths explícitos dos pacotes. Firebase, regras, índices e CI permanecem na raiz.

## Pacotes

- `packages/core` (`@work-track/core`): modelos, schemas, contratos de leitura/comandos e regras/casos de uso puros. Os contextos registration, reports, daily-hours, pause, removal, merge, split e people mantêm suas fronteiras. Os modelos canônicos de projeto/tópico e pessoa ficam em models; schemas de registro ficam em schemas; contratos e DTOs de transporte ficam em contracts. Subpaths de contexto reexportam definições canônicas quando necessário.
- `packages/data` (`@work-track/data`): codecs de documentos, portas de leitura, base de repositório, catálogo de projetos e implementações sobre snapshots imutáveis. Depende de core e Zod, nunca de Firebase, React ou transporte. Perfis explícitos de codec preservam as tolerâncias históricas de cada leitor.

O fluxo é `apps -> data -> core`, com `apps -> core` também permitido. Não há porta transacional universal Web/Admin nem cache singleton multiusuário no pacote.

## Backend

- `apps/backend/src/core/auth`: OAuth, identidade e adaptadores privados de credenciais.
- `apps/backend/src/core/http`: composição HTTP/Express e transporte MCP.
- `apps/backend/src/infrastructure/firebase`: adaptadores Admin para portas neutras.
- `apps/backend/src/modules/*/infrastructure`: persistência Admin, transações, idempotência, locks, auditoria e consultas específicas.
- `apps/backend/src/modules/*/presentation`: ferramentas MCP e handlers Callable/HTTP com autenticação e autorização autoritativa.
- `apps/backend/src/index.ts`: composition root e exports exigidos pelo Firebase.

Diretório administrativo de usuários, OAuth e escrita de auditoria permanecem exclusivamente no servidor. Políticas puras compartilhadas não substituem validação na fronteira do servidor.

## Frontend

- `apps/frontend/src/features`: páginas, componentes específicos e ViewModels por funcionalidade.
- `apps/frontend/src/infrastructure/firebase`: inicialização Web, adaptador de snapshots e gateway Callable de comandos.
- `apps/frontend/src/data/sources`: consultas autorizadas, listeners, reconciliação/coerência e metadata Web.
- `apps/frontend/src/data/cache`: stores por sessão, invalidação, revisões e isolamento da conta.
- `apps/frontend/src/shared/ui` e `components/ui`: apresentação e componentes comuns.
- `apps/frontend/src/app`: navegação e PWA; main compõe autenticação, providers e rotas.

O navegador calcula relatórios com os mesmos casos de uso do core e repositórios do data sobre fatos autorizados. Coerência de listeners, origem de cache e escritas pendentes são estados distintos. A autorização atual dos parents é revalidada sem consultas alternativas inseguras.

## Compatibilidade e segurança

Nomes, schemas públicos, URLs MCP/OAuth, coleções, documentos e algoritmos existentes são preservados. A extração não muda permissões Firestore nem a política de exclusão. Adaptadores mantêm paginação física e transações Admin onde são necessárias; listeners Web não simulam transação remota. Leitura completa não significa atomicidade conjunta de facts e catálogo: o loader Admin atual transaciona facts, mas lê parents separadamente.

Os decoders de leitura toleram legados conforme o perfil; schemas de escrita continuam mais restritos. Autorização precede decodificação de conteúdo privado nos caminhos que já exigiam essa ordem. Diretório completo de pessoas e labels de relatório são capacidades distintas.

## Validação

Testes ficam próximos das implementações; testes de estrutura da interface ficam em frontend/src/test/architecture. A regressão scripts/package-boundaries.test.mjs impede imports cruzados e SDKs/runtime nos pacotes. Exports relacionam source para desenvolvimento, declarações e JS compilado. Builds dos pacotes precedem validação dos consumidores. O artefato standalone de Functions é descrito em deployment.md.

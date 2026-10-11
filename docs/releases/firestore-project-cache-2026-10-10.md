# Projetos Web e cache Firestore — 2026-10-10

## Escopo aplicado

Implementado diretamente no checkout principal, branch main, por pedido humano explícito. A validação descrita nesta nota é local, não comprova deploy e não altera dados/Rules/indexes.

- Firebase Web inicializa persistentLocalCache + persistentMultipleTabManager: documentos consultados persistem em IndexedDB. Persistência Auth é independente. O SDK pode cair para memória quando IndexedDB não está disponível.
- Catálogo Web deixa de consumir listProjects/cache de Promises. Consulta Firestore work e personal do próprio UID; cache listeners fornecem dados locais, default listeners mantêm sincronização e metadata. Depois do primeiro snapshot default, essa branch fornece o estado canônico; o listener cache permanece local e não reintroduz versões obsoletas.
- O objeto projectRepository conserva apenas notificações de lifecycle/revisão; não armazena documentos ou Promises. Estado de renderização e projeções transitórias dos listeners não são um cache independente do catálogo.
- Fonte de registros próprios utiliza o mesmo catálogo autorizado para abrir/fechar queries por projectId. Atualizações e exclusões externas deixam de depender de refresh manual do catálogo. Histórico completo continua sem limit; paginação explícita preserva cursores físicos.
- Usuários/pessoas continuam consultados no backend, com provider em memória. Callables de comandos e autorização do servidor não mudam.
- Primeira assinatura exige confirmação de ambas as consultas no servidor antes de expor documentos persistidos de sessões anteriores. Não promete abertura offline após reload/logout nem autorização atual offline. Após confirmação, metadata de cache e pending permanece explícita. Logout não apaga IndexedDB: use em dispositivos confiáveis.
- Cache vazio/incompleto não é total confirmado; pendências provisórias não mostram “Tudo em dia”. Erros encerram assinaturas e descartam seus dados; retries dos relatórios reabrem o catálogo quando necessário.
- Catálogo cobre o contrato atual de criação com type obrigatório work/personal. Não foi acrescentada descoberta/fallback para documentos sem type nem alegada sua existência no banco; tais documentos não integram esta lista.

## Evidência

- npm run check passou: Prettier, ESLint, TypeScript, testes e builds. 792 testes (core146 + data28 + backend327 + frontend277 + tooling14). git diff --check passou.
- Regressões: tipos/scopes, cache vazio inicial, primeira confirmação de acesso, updates/deletes, revogação, descarte de callbacks de conta anterior, pending metadata, reconexão após erro, cursores/tombstones e estados de erro/retry dos consumidores. Testes usam SDK mocks; não são prova de persistência no navegador.
- Validação Docker/navegador ficou pendente: criação do projeto isolado worktrack-main-project-cache (frontend5186, Auth9116, Firestore8096, Functions5016, UI4016) foi negada pelo sandbox ao gravar buildx fora do checkout; as solicitações de aprovação expiraram. Nenhum container desse projeto iniciou. O ambiente anterior worktrack-refactor-shared-core-data/5184 permanece intacto e não contém estas mudanças da main.
- ESLint passou após excluir .release-check local e fixar tsconfigRootDir globalmente; não foi removido ou editado conteúdo de releases locais.

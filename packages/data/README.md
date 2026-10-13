# @work-track/data

Persistência neutra e repositórios compartilháveis. Depende somente de core e Zod, sem objetos ou funções dos SDKs Firebase.

## Conteúdo

- `ports/document-read-port`: leitura de documentos por IDs, sem transações universais ou escrita.
- `repositories/base-read-repository`: injeção de leitura e decoder.
- `repositories/project-catalog-repository`: deduplicação, lotes sequenciais de100 e materialização do catálogo. A mesma projeção pode processar snapshots Web existentes sem nova consulta.
- `codecs/*`: materialização tolerante de dados persistidos. Os modos históricos de leitura são explícitos; não misture esses codecs com schemas de novos comandos.
- `test-support/*`: quatro doubles de relatório e calendário sobre fixtures autorizadas em memória, exclusivamente para testes. Os antigos exports `repositories/snapshots/*` foram removidos; não existe caminho de compatibilidade para código de produção.

Adaptadores Admin/Web permanecem em apps. O AdminReadAdapter executa getAll; os listeners Web existentes sincronizam fatos autorizados e os repositórios nativos consultam o cache persistente para a seleção de tela. Uma projeção de snapshot não substitui essa consulta. Cache offline e autorização atomicamente atualizada não são equivalentes. Não cria escrita direta para substituir comandos transacionais do servidor.

## Fronteira obrigatória de produção e testes

É **proibido importar `@work-track/data/test-support/*` em código de produção**, inclusive imports de tipos, hooks, controllers, viewmodels, fontes de dados, frontend/backend ou repositórios reais. Os entrypoints explícitos desse namespace existem somente para os testes do frontend e do pacote; não são adaptadores de persistência nem fallback de cache.

Produção deve executar os predicados suportados na base de dados. No frontend, as consultas de seleção usam o cache persistente nativo do Firestore e seus índices locais, separadas dos listeners globais de sincronização; navegar ou mudar filtros não cria listeners remotos. Nunca usar os doubles para substituir consultas por seleção em arrays.

Os doubles simulam `ReportRecordSelection` (projeto, pessoa, arquivamento, interseção de período e identidade canônica de tópico) para testar os casos de uso. Somente `readPage` recebe essa seleção; `loadContext` mantém os fatos autorizados completos, inclusive outros projetos, datas e arquivados, para preservar o orçamento global. Opções omitidas preservam leitura histórica completa; opções fornecidas excluem arquivados por padrão. Esses filtros em memória são infraestrutura **de testes**, não uma exceção arquitetural de produção.

## Perfis de compatibilidade

Admin-owned/company preservam alocações não negativas e removem extras; Admin-project/Web-authorized preservam a aceitação histórica de negativos. Web-personal admite topics nullish, preserva extras das alocações e valida IDs próprios. Metadata Admin descarta todo o array de tópicos se um item for inválido; Web-personal filtra itens; Web-authorized retém o array raw. Tipos de projeto presentes e inválidos nunca se tornam legados compartilhados.

Build: `npm run build:packages` na raiz. Testes: `npm run test --workspace @work-track/data`, depois do build dos pacotes.

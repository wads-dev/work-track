# @work-track/data

Persistência neutra e repositórios compartilháveis. Depende somente de core e Zod, sem objetos ou funções dos SDKs Firebase.

## Conteúdo

- `ports/document-read-port`: leitura de documentos por IDs, sem transações universais ou escrita.
- `repositories/base-read-repository`: injeção de leitura e decoder.
- `repositories/project-catalog-repository`: deduplicação, lotes sequenciais de100 e materialização do catálogo. A mesma projeção pode processar snapshots Web existentes sem nova consulta.
- `codecs/*`: materialização tolerante de dados persistidos. Os modos históricos de leitura são explícitos; não misture esses codecs com schemas de novos comandos.
- `repositories/snapshots/*`: contratos de relatório sobre um snapshot autorizado em memória. Não gerenciam autenticação, listeners, cache ou lifecycle React.

Adaptadores Admin/Web permanecem em apps. O AdminReadAdapter executa getAll; o Web adapter somente projeta snapshots dos listeners existentes. Não promete offline/snapshot atomicamente autorizado como se fossem equivalentes. Não cria escrita direta para substituir comandos transacionais do servidor.

## Perfis de compatibilidade

Admin-owned/company preservam alocações não negativas e removem extras; Admin-project/Web-authorized preservam a aceitação histórica de negativos. Web-personal admite topics nullish, preserva extras das alocações e valida IDs próprios. Metadata Admin descarta todo o array de tópicos se um item for inválido; Web-personal filtra itens; Web-authorized retém o array raw. Tipos de projeto presentes e inválidos nunca se tornam legados compartilhados.

Build: `npm run build:packages` na raiz. Testes: `npm run test --workspace @work-track/data`, depois do build dos pacotes.

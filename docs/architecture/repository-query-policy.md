# Filtros: consultas no repository, nunca nas views

## Regra obrigatória

Views, viewmodels, hooks e controllers recebem datasets prontos e encaminham critérios ao repository. O repository executa todos os predicados suportados pela base. Não substituir igualdade, identidade, intervalo seguro ou paginação suportada por seleção manual de arrays. Resíduos somente para limitações concretas do Firebase, descritas abaixo. Codecs, ACLs, validação de comandos, agregação e geometria não são consultas de datasets.

## Fluxo Web

1. A sessão autenticada mantém sincronização global nativa de projetos/registros. Datas, filtros e rotas não criam targets de registros.
2. IndexedDB persistente e criação automática de índices locais permanecem habilitados.
3. O workspace sinaliza prontidão/invalidação; não é o banco de seleção das telas.
4. Repositories usam getDocsFromCache/getDocFromCache; nunca fallback remoto para consultar um filtro ou resolver ausência local.
5. Resultados async são cercados por conta/conexão/geração/ACL atual. Eventos somente de transporte/auditoria não refazem as listagens quando os fatos não mudaram.
6. Cache persistente sozinho não é autorização: catálogo autorizado da sessão e projeto atual são validados antes da exposição de registros.

O diretório de pessoas vem da API Auth por uma operação dedicada, não de uma coleção Firestore inventada. Identidades não são confidenciais; projeto/tópico podem ser. Busca de texto e opções usam a mesma projeção permitida na apresentação, evitando resultado baseado em título privado oculto.

Auditoria de registro é uma fonte adicional distinta do dataset de relatórios: seu sync continua com demanda explícita de detalhe, limitado ao pai próprio autorizado, para não reintroduzir centenas de listeners. A demanda é administrada pelo runtime de sessão; o repository consulta exclusivamente a subcoleção local com orderBy(documentId) e limit. Não afirmar que abertura de auditoria é zero targets remotos; os filtros de calendário/listas, sim. Converter auditoria em sync global econômico requer um contrato próprio de consulta/Rules que o schema histórico atual não fornece; não ampliar grants recursivos nem fazer varredura de auditorias privadas.

## Mapa de implementação

| Área                         | Critérios executados pela base                                                                       | Residual concreto                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Projetos Web                 | IDs autorizados em lotes, ID solicitado, tipo personal, archived boolean explícito/mergedInto string | validação estrita de type/archived/confidential; busca normalizada em título/descrição/tópicos                                    |
| Registros Web                | coleção do proprietário, uid, projectId, documentId/cursor, envelopes seguros de data/estado fechado | validação canônica de estado; datas ISO com offsets; tópico dentro de arrays de objetos; busca na projeção segura; join ACL atual |
| Relatórios Web               | IDs de projeto atuais, projectId/uid em lotes, documentId/cursor, três branches temporais locais     | validação de schema, interseção exata de instantes/aliases, merge de branches independentes                                       |
| Detalhe/descrições/auditoria | IDs exatos de proprietário/registro/projeto, subcoleção exata, orderBy e limit                       | consistência e ACL atual; elementos de tópicos embutidos                                                                          |
| Editor/tópicos               | IDs autorizados, consulta ID exata do projeto atual                                                  | seleção de elementos de arrays obrigatórios, aliases/estado explícito, retenção das alocações já selecionadas                     |
| Relatórios Admin             | proprietário/projectId/uid, shards de pessoas, data superior segura, ordem e cursor compostos, limit | validação de endedAt/deletedAt/topics; ISO-offset; join projeto atual; aliases                                                    |
| Horas diárias Admin          | histórico global próprio; seleção separada com projeto e data superior segura em transação read-only | interseção exata e join arquivo/ACL                                                                                               |
| Registros recentes Admin     | uid, envelopes seguros de início/fim, três branches ordenadas na base                                | instantes ISO-offset, tombstones e ACL de projeto; cursor visível cronológico após resíduos                                       |
| Descoberta/busca Admin       | tipo/owner para personal, limites físicos, seleção/paginação no repository                           | validação estrita de tipo work/personal, busca fuzzy e associação GitHub normalizada                                              |
| Diretório Auth               | paginação listUsers                                                                                  | domínio/verificação/provider/desativado e busca: Auth não fornece esses predicados                                                |
| Inventário de exclusão       | coleções/grupos e limites físicos documentados                                                       | referências arbitrariamente aninhadas, snapshots históricos, descendentes e órfãos não possuem consulta recursiva                 |

## Datas, OR/AND e storage canônico

Firestore suporta and/or e intervalos em vários campos. Com datas normalizadas, sobreposição fechada é start < fim AND end > início; pontos/abertos têm semântica própria. Início dentro OU fim dentro perde intervalos que atravessam o período inteiro.

Neste schema startedAt/endedAt preservam ISO textual com offsets. Comparação lexical UTC não equivale a instante. Os candidatos usam envelopes conservadores de dois dias (o writer aceita offsets até ±23:59); a comparação Date.parse exata é residual no repository. Calendário divide candidatos recentes, fechados que atravessam o limite e abertos com `endedAt == null`; não há branch de compatibilidade para campos ausentes. Não há filtro inferior de início que descarte spans. O limite superior também suporta seleção unilateral e sentinela lexical na borda do ano9999. Cursores Web e Admin respeitam ordem UTF-8 por segmento de caminho. A revalidação consulta apenas os nomes canônicos selecionados, sem reunir o histórico completo de vários participantes em uma única guarda2000; branches com pessoas explícitas preservam o orçamento por pessoa.

Registros canônicos exigem `endedAt: string | null`, `deletedAt` presente e `topics` array obrigatório. Somente `endedAt: null` significa aberto e somente `deletedAt: null` significa ativo; nenhum campo ausente recebe fallback. Projetos exigem `type: work | personal`, `archived` e `confidential` boolean explícitos; tópicos exigem `archived` boolean explícito. Ausência ou tipo de projeto inválido nega acesso; `mergedInto` continua identificando mesclagem. Produção foi [migrada](../project-type-migration.md) em 14/10/2026: 13 projetos e 446 registros, zero campos canônicos ausentes no inventário final. Auditorias e evidências históricas permanecem intactas. Os guards de publicação desse rollout foram removidos a pedido humano; migração não é responsabilidade da CI.

Consultas temporais assumem datas persistidas válidas conforme os writers. Elas não são inventário completo de corrupção: uma data arbitrária fora do envelope pode não ser candidata. Resultados consultados continuam validados. Qualquer normalização temporal futura deve preservar texto/evidência e cobrir TODOS os writers e documentos; a migração de campos obrigatórios não normalizou os instantes ISO.

Consultas com múltiplos campos são limitadas a 10 campos de desigualdade e OR a 30 disjunções após expansão DNF. Shards/lotes são transporte, não filtro manual substitutivo. Cursor Admin temporal codifica startedAt + document name e envelope; não reutilizar cursor apenas ID com outra ordenação. A ordenação de caminhos compara segmentos, não strings concatenadas. Índices remotos declarados não substituem os índices locais do SDK.

## Contexto global e resultados derivados

Seleção de display é independente de loadContext. Estimativas personal-v3 usam todo o histórico autorizado da pessoa, inclusive projetos/datas/tópicos não selecionados e arquivo, para próximo início/6h/meia-noite. Filtrar contexto antes do orçamento altera as horas. Não há teto diário artificial.

Buckets alocados, semanas ocupadas, eixos/colunas, intervalos efetivos e pontos de duração zero são cálculos, não campos armazenados consultáveis. Repositories de saída derivada recebem esses resultados e critérios de drilldown/paginação sem reduzir contexto ou recalcular totais. Geometria/clip e validação de schema permanecem no domínio.

## Integridade e limites

- Seleção completa: até2000 fatos e20 páginas físicas; falha explícita ao exceder, sem subtotal silencioso.
- Contexto Admin: até2000 autorizados/pessoa e10000 físicos/pessoa; consultas abertas/pausa/registro anterior têm guarda física10000.
- Consultas locais de relatório: limit2001 + falha quando excede2000; união entre lotes tem guarda de contexto. Paginação local só limita saída após os resíduos necessários; branches independentes não têm limit/ordenação global na base.
- Descoberta:1000 projetos físicos; relatórios mínimos:2000 físicos. Limitações são reportadas, nunca convertidas em ausência de tracking.
- ACL atual, dono path/payload, tombstones, aliases e consistência do snapshot são validações obrigatórias.

## Índices locais completos

Firebase12.19.0/Firestore4.17.2 tinha cursor de tail collection-group aplicando o último segmento de outro pai. O patch versionado em prepare muda somente esse cursor em cinco bundles completos, valida todas as âncoras antes de escrever e falha fechado se a versão divergir. Regressão executa os métodos reais:8/11 antes,11/11 depois. Nenhum índice é desabilitado e não resta varredura collection-wide/manual no runtime para contornar o defeito. Docker frontend também executa prepare antes da otimização Vite.

## Proteções contra regressão

AST guard examina views/hooks/controllers/aplicações e permite somente expressões exatas de geometria/codec/validação aprovadas, não seletores de negócio. Package boundary proíbe import de test-support/snapshots em produção, incluindo tipos/import dinâmico. Os antigos repositories em memória são doubles exclusivos de teste, não fallback da aplicação.

Referências oficiais: [consultas compostas](https://firebase.google.com/docs/firestore/query-data/queries), [múltiplos campos de intervalo](https://firebase.google.com/docs/firestore/query-data/multiple-range-fields), [persistência e índices locais](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

## Evidências históricas de validação

Os resultados abaixo pertencem ao checkpoint original desta implementação, anterior à migração canônica de 14/10/2026. Fixtures com campos ausentes descrevem aquela execução, não compatibilidade de leitura atual.

- Check integral:162 core +54 data +374 backend +555 frontend +32 tooling =1177 testes (incluindo a barreira de publicação Functions); Prettier/ESLint/TypeScript/builds aprovados.
- Rules reais:12/12, processo Java exclusivo do harness dentro do Docker, somente projeto demo sintético.
- Admin real no Firestore Emulator: branches recentes retornam span fechado, aberto ausente/null antigo e offset +23:59; excluem candidato futuro/fechado antigo. Cursor composto avança duas páginas físicas sem repetir o último documento.
- Navegador autenticado (dados reais, somente leitura): mudança de período, registros, projetos/busca, relatório de projeto, tópico, pessoas/busca, confidencialidade e pendências. Cache global completo403+29=432 fatos; quatro targets globais; contagem remota de registros permaneceu igual na navegação testada; zero escritas.
- F5: somente três chaves numéricas cumulativas de métricas; valores preservados. Nenhuma telemetria remota adicionada. Os contadores são observações do SDK, não fatura nem contagem de pacotes únicos.

O catálogo Auth tem sua operação dedicada e auditoria tem demanda explícita como documentado acima; não confundir essas fontes com novos listeners de registros a cada filtro. Nenhuma migração/backfill ou alteração de fatos de produção foi feita.

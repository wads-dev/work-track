# Migração auditada de tópicos corporativos

## Contrato

- MCP: `move_topic` substitui `move_subject`; `topic_origin`/`topic_target` substituem `subject_origin`/`subject_target`. Resposta usa `resolvedTopic`. Clientes precisam redescobrir as tools e adaptar parâmetros; não há alias MCP antigo.
- Callable: `moveTopic` substitui `moveSubject`; frontend atualizado no mesmo PR. Auditorias históricas `move_subject` continuam legíveis. Não reescrever histórico.
- `move_topic` entre projetos corporativos inclui registros ativos de todos os participantes do tópico. O ator deve estar autenticado e autorizado a acessar ambos os projetos. Legado sem tipo conserva escopo corporativo existente.
- `move_record` aceita `recordOwnerUid` opcional: omissão mantém o comportamento de localizar o próprio registro; valor explícito identifica o proprietário de um registro corporativo, nunca o ator.
- Projetos pessoais continuam restritos ao proprietário. Não há transferência entre pessoal/corporativo.

## Evidências e segurança

Prévia não escreve. Ela inclui `records` com IDs/proprietários/caminhos, `participantUids`, contagem, destino e avisos. IDs iguais em contas diferentes são distintos por caminho. Execução exige confirmação humana com o mesmo token, intenção, motivo e requestId. Novos registros e alterações em qualquer participante invalidam a prévia.

A migração preserva caminho, UID proprietário, fatos, textos e distribuições. `updatedBy`/`authorUid` identificam o ator; cada auditoria registra `recordOwnerUid`, `recordPath` e snapshots antes/depois. Projetos e registros possuem auditoria e recibo idempotente. Retry revalida acesso atual aos projetos.

A origem permanece para histórico e nenhum projeto é arquivado/apagado. Limites continuam: 100 registros por execução atômica, 2000 registros físicos de contexto; tópicos múltiplos, aliases e projetos com histórico de mesclagem exigem conciliação dedicada. Sem desfazer automático.

## Infraestrutura

Consulta corporativa usa `collectionGroup(records)` filtrada por `projectId` após validação de acesso e escopo. O índice single-field COLLECTION_GROUP de `records.projectId` já está declarado; nenhuma regra cliente é ampliada, pois a migração usa backend autenticado. Testes in-memory não substituem smoke no ambiente com índice pronto.

## Publicação

Este PR não executa migração de dados nem deploy manual. Após revisão/merge e deploy backend+frontend, reconectar clientes MCP, obter nova prévia e confirmar migração real. O callable legado pode permanecer fisicamente publicado até retirada operacional; clientes novos usam apenas `moveTopic`.

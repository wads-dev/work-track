# Conciliação histórica pelo MCP

As ferramentas usam a identidade OAuth corporativa já autenticada. O proprietário
padrão é o próprio usuário; para outro participante informe recordOwnerUid.
Projetos pessoais de terceiros nunca são retornados. Arquivados continuam legíveis;
projetos bloqueados/arquivados não são editáveis.

## Contar e revisar

1. Descubra o ID do projeto e do tópico Geral com search_projects.
2. Use list_records com projectId, topicId e from ISO com fuso explícito (por
   exemplo, 2026-06-01T00:00:00-03:00). Não deduza o ano sem contexto humano.
3. totalCount é a contagem completa autorizada, não o tamanho da página. Siga
   nextCursor enquanto hasMore. O período é [from,to) por sobreposição: inclui
   registros fechados que atravessam todo o intervalo e abertos antigos.
4. Leia originalText, interpretation, tópicos e interrupções. get_record busca o
   estado atual por recordId e devolve expectedVersion de precisão nanosegundo.
5. Preserve casos ambíguos. Para casos claros use update_record_topics_batch.

## Prévia e execução

Envie requestId estável e records com recordId, recordOwnerUid opcional, topicIds,
expectedVersion e reason. confirmed ausente/false é somente leitura. Examine
results antes de enviar confirmed true com o mesmo conteúdo. São até 100 itens;
a atomicidade é por registro, não por lote. Inspecione cada status: preview,
updated, replayed ou rejected. Falhas não desfazem os itens já concluídos.

O patch só contém topics, topicSnapshots, updatedAt e updatedBy. Horários,
projeto, textos, interrupções e distribuições ficam intactos. Remapeamentos de
registros com percentuais/minutos explícitos são rejeitados, mesmo quando o
número de tópicos coincide; esta API não inventa alocação. Tópicos inexistentes,
arquivados, aliases ou duplicados são rejeitados. Auditoria transacional conserva
ator, proprietário, motivo, pedido e fatos completos antes/depois. Retentar o mesmo
item/requestId retorna replayed; conteúdo diferente com o mesmo ID é rejeitado.
Cada item revalida ACL e versão na transação antes de escrever.

## Limites e consistência

A listagem faz consulta nativa por proprietário, projeto, deletedAt e limite
superior conservador de startedAt. Datas históricas são strings ISO com offsets;
Firestore não compara seus instantes normalizados. O predicado exato de
sobreposição fica no repository. topics é array de mapas com distribuição
opcional: Firestore não consulta topicId dentro de cada mapa; esse residual
fica no repository também. Não há listeners nem consulta de tela alterados.

Até 10000 registros candidatos por chamada, mais metadados dos projetos
referenciados. Acima disso a ferramenta falha explicitamente sem total parcial.
Restrinja projeto/período superior; from sozinho não reduz candidatos físicos,
pois não pode excluir registros antigos que cruzam o período.

O cursor vincula ator, filtros e impressão do conjunto completo. Alterações no
conjunto invalidam o cursor e exigem reinício; não há promessa de snapshot
imutável entre chamadas. Cada página reconta o conjunto; prefira filtros precisos.
As consultas reutilizam índices existentes. Nenhum dado de produção é migrado
ou corrigido pela publicação destas ferramentas.

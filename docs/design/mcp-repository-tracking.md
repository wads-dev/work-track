# MCP: contexto por repositório e edição auditada

## Diagnóstico publicado

Em 11/10/2026, a conexão MCP autenticada retornou get_instructions antigo: somente registro próprio, sem recentes e com políticas de horas 8h/4h. O endpoint HTTP sem autenticação retornou 401 invalid_token. O código local anterior já aceitava topics em update_record; não foi reproduzida escrita em produção e portanto não é possível atribuir a falha relatada a uma validação ou deploy específico. Os testes HTTP locais agora cobrem transporte, descoberta, rejeição de UID injetado e movimento consolidado. Depois de publicar, reconectar o cliente/atualizar tools/list e testar correção solicitada com IDs autorizados. Nenhum dado de produção foi modificado.

## Contrato

- Tópico possui githubUrl opcional; update_topic altera tópico existente com motivo, requestId e auditoria. UI usa escrita direta.
- search_repository_context aceita HTTPS, SSH, owner/repo ou nome; busca lexical, sem rede GitHub nem embeddings, limitada ao catálogo autorizado.
- get_instructions inclui recentRecords compactos; list_recent_records permite atualizar e paginar. Últimas 24h por padrão (início ou sobreposição), incluindo abertos antigos. Retorna ID, projeto, tópicos, título de até 70 pontos Unicode, início/fim e queriedAt. hasMore/nextCursor são explícitos.
- Leitura de histórico histórico é limitada a 2000 documentos; exceder falha, nunca informa ausência de tracking com dados parciais. Migração/indexação de abertos históricos é melhoria futura de custo.
- update_record aceita campos de negócio; identidade e intenção de registro permanecem. Antes/depois completos na auditoria, com ator e idempotência. recordOwnerUid explícito permite colaboração corporativa, pessoal alheio permanece inacessível. Publicação pessoal para corporativo exige acknowledgeSharedDestination.
- move_record deixa de ser ferramenta: edição normal usa projectId/topics sem prévia dupla. Para preservar criação/reuso de tópico e operações históricas, update_record aceita alternativamente o contrato project_target/topic_target com prévia/token/confirmação. move_topic continua para lotes. Callables/UI históricas não são removidas.
- list_topic_merges removido apenas da descoberta MCP; histórico interno e UI preservados.
- Plano de persistência compartilhado em data e validação em core; frontend próprio escreve diretamente. Colaboração corporativa está implementada no adaptador MCP; regras Web continuam restritas ao dono.

## Ajustes visuais solicitados

Cartão do calendário não mostra texto de contexto; mantém horários, projeto e tópicos. Snapshots idênticos de metadados Firestore mantêm identidade de repositório para evitar recálculos/piscadas sem alteração de fatos. Revogação de acesso continua sendo aplicada imediatamente.

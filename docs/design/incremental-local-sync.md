# Sincronização incremental e leituras locais Web

## Contrato

Calendário, relatórios (inclusive tópicos), catálogo, pendências, listas, detalhe de registro e auditoria observam a materialização local. Nenhum observer de tela abre consulta Firestore ou callable de leitura. A sessão autenticada possui um listener pequeno: webSyncState/head. Datas, filtros e rotas não são entradas do sincronizador.

Os dados ficam em IndexedDB separado por origin, Firebase project e UID. Checkpoint, registros, projetos, auditorias e certificados de bootstrap são gravados na mesma transação. Web Locks serializa pulls e gravações entre abas; navegador sem Web Locks falha explicitamente, sem fallback para leituras remotas nas telas. Uma defesa de cursor na transação também impede sobrescrever revisão superior.

Ao perder foco/visibilidade, para o listener e cancela publicação de resultados em trânsito. Ao voltar, revalida catálogo/autorização e solicita somente deltas posteriores ao cursor persistido. Dados ficam fenced até a revalidação para evitar exposição após revogação. Logout não apaga o IndexedDB, mas encerra listeners e descarta memória; use somente em dispositivo confiável.

## Bootstrap e custo

Uma instalação/cache novo precisa receber o histórico autorizado uma vez. Bootstrap por projeto é paginado em 250 registros físicos; novas concessões/gerações de projeto precisam bootstrap somente do projeto afetado. Não é feito bootstrap ao mudar data/filtro/rota ou reload normal. Perda/limpeza do IndexedDB também exige bootstrap; não é possível reconstruir histórico exclusivamente a partir de cache inexistente.

Não existe promessa de zero leituras de sincronização. O head custa leituras de um documento; delta lê o journal posterior ao cursor e os documentos canônicos alterados, além do catálogo de projetos para autorização atual. Triggers têm leituras/escritas de journal, ledger e head por alteração. São custos proporcionais a alterações e catálogo, não ao histórico inteiro por interação. O journal global também acorda usuários não afetados; a escala atual permite isso, uma futura partição por audiência pode reduzir esse custo.

## Backend

Triggers capturam writes Web, MCP e Admin em projetos, registros e auditoria, inclusive hard delete e writes sem updatedAt. A sequência é atribuída transacionalmente na publicação; ledger por event.id torna retry idempotente. A transação lê estado canônico atual, nunca confia em snapshot atrasado do trigger. Não se usa relógio de cliente nem campos updatedAt heterogêneos como cursor.

Journal privado. Callable revalida autenticação corporativa e ACL atual; não transmite conteúdo histórico do journal, hidrata somente caminhos alterados em lote. Auditoria é restrita ao proprietário e parent atual autorizado. Ausência/perda de acesso elimina dados locais. Cursor físico deve ser contíguo mesmo quando eventos privados não são transmitidos; gaps/limites falham explicitamente sem publicar totais parciais.

## Consistência e operação

Triggers são assíncronos: head é revisão entregue do journal, não prova de ausência de alterações canônicas ainda aguardando trigger. A materialização é eventualmente consistente; após um write pode haver atraso até trigger/catch-up. Não afirmar consistência transacional entre documentos ou revogação instantânea offline. Bootstrap é seguido de catch-up antes de liberar relatório, e mudanças de escopo/geração invalidam seu certificado. Para garantias mais fortes seria necessário migrar TODOS writers para outbox atômico.

Journal/ledger não possuem TTL/retention: apagar entradas sem protocolo de low watermark causa erro explícito, nunca salto silencioso de cursor. Monitorar crescimento e contenção do head. Catálogo global limitado a1000 projetos, com erro acima; auditorias têm orçamento agregado explícito. Dados canônicos não são migrados automaticamente.

## Deploy

Publicar backend/triggers/regras/índices antes de servir frontend novo; enquanto syncWorkspace indisponível frontend falha fechado, não volta a consultas caras. Deploy não realizado automaticamente por esta correção. Primeiro carregamento após migração é bootstrap da materialização nova; não considerar essa transferência inicial regressão de navegação.

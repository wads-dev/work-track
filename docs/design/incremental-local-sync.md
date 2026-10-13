# Sincronização incremental e leituras locais Web

## Substituição por Firestore SDK nativo — 2026-10-13

A arquitetura de sincronização do PR28 está **superseded**. O transporte Web passa a usar o Firestore SDK nativo, suas consultas/listeners e persistência local, sem Function de sincronização, head, journal, ledger ou triggers auxiliares. O frontend nativo é implementado e validado separadamente nesta worktree; os requisitos abaixo não são evidência de execução.

- Removidos do backend: syncWorkspace, journalProjectForWebSync, journalRecordForWebSync e journalAuditForWebSync, incluindo implementação e testes específicos do protocolo antigo.
- Removidos os exports HTTP/callable getTopicReport e discoverLegacyProjectIds. O handler de relatório de tópicos, seu repositório e testes continuam preservados; comandos e MCP não são alterados.
- As Rules não concedem mais leitura do head e não declaram coleções de journal/ledger. Dados antigos em webSyncState, webSyncEvents, webSyncDeliveries e webSyncProjectGenerations continuam privados pela regra final de negação; nenhum documento é apagado por esta mudança.

## Contrato da substituição

Calendário, relatórios, catálogo, pendências, listas, detalhe de registro e auditoria devem continuar observando dados locais. Navegação, datas e filtros não devem abrir leituras remotas por tela. A sessão central usa o SDK nativo para receber mudanças nos documentos canônicos, inclusive escritas Web, MCP e Admin, sem copiar mudanças para journal ou depender de publicação assíncrona de triggers.

A descoberta frontend usa queries nativas de projetos work e personal do próprio UID, além de referências conhecidas. Projetos legados sem type não são descobertos por essas queries; a leitura individual autorizada continua possível. Uma broad query para legados exige análise/ajuste separado de discovery Rules e não é habilitada pela remoção do sync. Rules de descoberta, acesso a projetos/registros/auditoria e outras Functions permanecem inalteradas neste recorte.

A persistência precisa manter isolamento por ambiente e UID, tratamento explícito de erros, fencing/revalidação de autorização e encerramento de listeners em logout/perda de foco conforme o ciclo de vida definido pelo frontend. Não prometer revogação instantânea offline, consistência transacional entre snapshots independentes ou totais completos antes de concluir a sincronização autorizada. Cache ausente ainda exige transferência inicial; reconexão, mudanças de query e duração da desconexão podem gerar leituras cobradas pelo Firestore. Não existe promessa de zero leituras nem de retomada incremental sem custo em todo cenário.

## Operação da substituição

Não foi feito deploy por esta alteração. A publicação futura precisa coordenar frontend e Rules e retirar explicitamente as Functions antigas de qualquer ambiente onde tenham sido publicadas; remover exports do código não remove recursos já implantados. Triggers antigas implantadas continuariam gerando journal/custos até a remoção operacional. Evidências do PR28 abaixo não validam o SDK nativo e sua antiga ordem de deploy não deve ser seguida. Dados auxiliares existentes não são migrados, reutilizados nem excluídos automaticamente; qualquer limpeza requer autorização separada.

## Histórico preservado — PR28 (superseded)

O texto a seguir registra o desenho substituído, não o contrato atual nem instruções operacionais vigentes. Preservado para rastreabilidade das decisões e das evidências da release original.

### Contrato

Calendário, relatórios (inclusive tópicos), catálogo, pendências, listas, detalhe de registro e auditoria observam a materialização local. Nenhum observer de tela abre consulta Firestore ou callable de leitura. A sessão autenticada possui um listener pequeno: webSyncState/head. Datas, filtros e rotas não são entradas do sincronizador.

Os dados ficam em IndexedDB separado por origin, Firebase project e UID. Checkpoint, registros, projetos, auditorias e certificados de bootstrap são gravados na mesma transação. Web Locks serializa pulls e gravações entre abas; navegador sem Web Locks falha explicitamente, sem fallback para leituras remotas nas telas. Uma defesa de cursor na transação também impede sobrescrever revisão superior.

Ao perder foco/visibilidade, para o listener e cancela publicação de resultados em trânsito. Ao voltar, revalida catálogo/autorização e solicita somente deltas posteriores ao cursor persistido. Dados ficam fenced até a revalidação para evitar exposição após revogação. Logout não apaga o IndexedDB, mas encerra listeners e descarta memória; use somente em dispositivo confiável.

### Bootstrap e custo

Uma instalação/cache novo precisa receber o histórico autorizado uma vez. Bootstrap por projeto é paginado em 250 registros físicos; novas concessões/gerações de projeto precisam bootstrap somente do projeto afetado. Não é feito bootstrap ao mudar data/filtro/rota ou reload normal. Perda/limpeza do IndexedDB também exige bootstrap; não é possível reconstruir histórico exclusivamente a partir de cache inexistente.

Não existe promessa de zero leituras de sincronização. O head custa leituras de um documento; delta lê o journal posterior ao cursor e os documentos canônicos alterados, além do catálogo de projetos para autorização atual. Triggers têm leituras/escritas de journal, ledger e head por alteração. São custos proporcionais a alterações e catálogo, não ao histórico inteiro por interação. O journal global também acorda usuários não afetados; a escala atual permite isso, uma futura partição por audiência pode reduzir esse custo.

### Backend

Triggers capturam writes Web, MCP e Admin em projetos, registros e auditoria, inclusive hard delete e writes sem updatedAt. A sequência é atribuída transacionalmente na publicação; ledger por event.id torna retry idempotente. A transação lê estado canônico atual, nunca confia em snapshot atrasado do trigger. Não se usa relógio de cliente nem campos updatedAt heterogêneos como cursor.

Journal privado. Callable revalida autenticação corporativa e ACL atual; não transmite conteúdo histórico do journal, hidrata somente caminhos alterados em lote. Auditoria é restrita ao proprietário e parent atual autorizado. Ausência/perda de acesso elimina dados locais. Cursor físico deve ser contíguo mesmo quando eventos privados não são transmitidos; gaps/limites falham explicitamente sem publicar totais parciais.

### Consistência e operação

Triggers são assíncronos: head é revisão entregue do journal, não prova de ausência de alterações canônicas ainda aguardando trigger. A materialização é eventualmente consistente; após um write pode haver atraso até trigger/catch-up. Não afirmar consistência transacional entre documentos ou revogação instantânea offline. Bootstrap é seguido de catch-up antes de liberar relatório, e mudanças de escopo/geração invalidam seu certificado. Para garantias mais fortes seria necessário migrar TODOS writers para outbox atômico.

Journal/ledger não possuem TTL/retention: apagar entradas sem protocolo de low watermark causa erro explícito, nunca salto silencioso de cursor. Monitorar crescimento e contenção do head. Catálogo global limitado a1000 projetos, com erro acima; auditorias têm orçamento agregado explícito. Dados canônicos não são migrados automaticamente.

### Deploy

Publicar backend/triggers/regras/índices antes de servir frontend novo; enquanto syncWorkspace indisponível frontend falha fechado, não volta a consultas caras. Deploy não realizado automaticamente por esta correção. Primeiro carregamento após migração é bootstrap da materialização nova; não considerar essa transferência inicial regressão de navegação.

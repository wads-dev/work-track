# Divisão explícita de registro (MCP)

`split_record` divide um intervalo factual próprio encerrado em até três partes sem lacunas, sobreposição ou criação de horas. Não é abono, faturamento, estimativa nem desfazer. Não escreve `endedAt` em registro aberto.

## Contrato

Entrada: `recordId`, `segmentStartedAt`, `segmentEndedAt` (ISO com offset), `destinationProjectId`, `destinationTopics` (IDs existentes e percentuais opcionais explícitos), `requestId` estável, `reason`. `confirmed` é falso por padrão. Prévia retorna partes completas, durações em milissegundos, total, IDs determinísticos, `previewToken`, `warnings` e `requiresSharedAcknowledgment`. Array vazio de assuntos usa somente Geral canônico único existente, exibido na prévia; não cria assuntos.

Mostre a prévia à pessoa. Só após confirmação humana envie `confirmed: true` e o mesmo token/intent/requestId. Token é uma revisão otimista, não um segredo nem autorização: liga UID, intenção, fato e revisões dos projetos. Mudanças entre prévia e confirmação exigem nova prévia. ACL atual continua obrigatória em toda chamada e retry.

Transferência pessoal para corporativo publica **texto original completo e interpretação**, não apenas frase do segmento. Prévia indica esse risco; confirmação exige adicionalmente `acknowledgeSharedDestination: true`, que é registrado na auditoria e reexigido no retry. Metadados pessoais adicionais desconhecidos bloqueiam transferência corporativa; não apague evidências para contornar. Snapshots do trecho movido usam projeto e assuntos destino.

## Conservação, identidade e auditoria

O ID original fica no primeiro segmento cronológico: ao mover a borda inicial ou todo o período, esse ID pode passar para o projeto destino. Partes extras têm IDs SHA-256 determinísticos ligados à operação. Conserva-se a soma exata de milissegundos. Texto/contexto/fuso e campos originais são preservados, exceto metadados de resolução/referências anteriores que não descrevem mais o trecho movido.

A transação grava original, partes extras, `users/{uid}/splitAudits/{operationId}` (Admin-only) e auditoria do registro original (legível pelo proprietário nas regras atuais). Guarda o snapshot completo anterior. Nenhum histórico é apagado. Prévia não escreve sequer token/ledger. Colisões, falhas de transação e revisões antigas não fazem writes parciais. Payload diferente com mesmo requestId é rejeitado. Retry da confirmação devolve resultado existente somente se fatos e ACL atuais ainda corresponderem; nunca duplica ou reverte edição posterior.

Fingerprint/requestId de registro original continuam nele para o retry de `register` retornar os fatos pós-divisão como duplicata sem reescrever o período antigo. Partes extras **não** herdam essa identidade de registro: somente proveniência separada `splitSourceRequestId`/`splitSourceFingerprint`.

## Limites deliberados

Minutos absolutos de assuntos e quaisquer interrupções não vazias exigem contrato futuro de repartição temporal explícita; esta versão rejeita sem inferir ou duplicar alocações. Percentuais dos assuntos retidos permanecem percentuais e destino usa somente percentuais informados. Projetos/assuntos arquivados, aliases e projetos em mesclagem são bloqueados. Datas são comparadas como instantes, não strings. Intervalo factual deve ter terminado até o instante da operação. Auditoria JSON estimada acima de 700KB é rejeitada antes de writes; limites reais adicionais do Firestore também falham atomicamente. Não há backfill, index deployment ou alterações de regras.

Testes unitários cobrem prévia read-only, intervalos centrais/bordas/full, conservação, offsets, owner/ACL/orphans, assuntos, concorrência, confirmação sem token, publicação explícita, idempotência/replay original, colisões, rollback e tamanho. O mock transacional verifica ausência de commits em falhas; não substitui testes de integração em emulator/prod.

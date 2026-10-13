# Produção: estabilidade, índices locais e completude

Correção publicada diretamente em main por autorização humana. A primeira revisão c96d490 remove re-enable inicial redundante, dupla assinatura, fanout de centenas de auditorias e replays que remontavam relatórios. Índices locais automáticos do SDK estão habilitados. Apenas4 Functions declaradas: mcp,listCompanyPeople,exportProjectForDeletion,deleteProjectPermanently. Callables createProject/mergeProjects/mergeTopics/moveTopic foram retirados remotamente; serviços MCP preservados.

Validação autenticada em worktrack.wads.dev e frontend Docker localhost:5193 com Firebase produção (somente leitura): todas8 telas do menu em duas passagens,30 mudanças de período,0 novos alvos/0 novas Functions/0 erros; foco mantém visual enquanto transporte SDK pausa/retoma.

## Completude adicional

Reabertura revelou omissão pelo índice local de collectionGroup parcialmente backfilled no Firebase12.19.0. O IndexedDB continha430 registros, mas consulta filtrada retornava380+29 (REST count autorizado401+29). A revisão adicional não desliga índices: somente a materialização GLOBAL dos registros usa getDocsFromCache(collectionGroup(records)) integral e filtra IDs autorizados da sessão. Nenhuma assinatura remota ampla; continuam2 consultas projects + registros agrupados com in até10 IDs para limite Rules. Teste de regressão simula401 registros, índice parcial380 e documento privado estranho, comprovando401 autorizados sem vazar privado. Três reloads locais com Firebase produção retornaram430/430 e zero erros.

## Diagnóstico

Console opt-in: localStorage.setItem("work-track:firestore-debug","1") e recarregar. window.__workTrackFirestoreDebug.exportLog() retorna .log textual; clear() limpa contadores locais. Eventos cache.indexes/cache.read/cache.result/cache.filtered (persistência), listen.attach/listen.event/listen.return/listen.detach (fonte e quantidade docChanges), local.workspace/project/record/report.read, people.memory/remote e callable.start/result. Nenhum token, payload ou conteúdo de atividade é logado.

Listener evento remote não significa retransmissão de todos docs: count é tamanho da consulta e changed é delta SDK. Medição navegador do transporte na reabertura contou0 documentChange/0 documentDelete/0 documentRemove e somente metadados de alvos. Não é medidor de faturamento: reconexão depois30min, mudanças, Rules dependent reads e refresh directory Auth podem custar. Não prometer leitura remota zero para sempre. Navegação de telas não dispara rede; reabertura confirma ACL/sync por SDK e chama diretório Auth existente uma vez.

Checks completos finais:932 testes (155core+31data+335backend+392frontend+19tooling), lint/types/build. Ambiente local produção permanece disponível; nenhuma escrita/apagamento de registros produção durante testes. Relatório diagnóstico completo entregue como arquivo separado, não versionado com IDs privados.

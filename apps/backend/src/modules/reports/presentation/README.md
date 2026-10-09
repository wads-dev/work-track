# Apresentação de relatórios

`getProjectReport` é uma Firebase callable v2 em `southamerica-east1`. Exige token Firebase Auth Google verificado `@wads.dev`; não altera rotas MCP/OAuth nem libera collectionGroup diretamente aos clientes. Retorna somente intervalos resumidos, UID/nome de exibição e agregados, nunca texto privado, email ou credenciais.

Contrato tipado em `../domain/project-report.ts`, política `project-report-v1`. Totais e limite de estimativas são por página/projeto, não globais; avisos descrevem esse escopo. Fatos fechados não são truncados; estimativas não são persistidas. Distribuições informadas contraditórias são preservadas e sinalizadas. Sem divisão, um tópico único recebe integral; múltiplos tópicos usam bucket não distribuído.

O cursor é caminho canônico `users/{uid}/records/{recordId}`, ordenado por documentId; dados malformados falham com erro genérico em vez de vazar detalhes. A consulta usa índice ASC COLLECTION_GROUP de `records.projectId`. Nomes via Admin Auth são best effort com fallback UID.

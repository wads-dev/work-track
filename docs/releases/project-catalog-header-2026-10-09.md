# Catálogo compartilhado, seletores e cabeçalho de Projetos

Entrega local solicitada em 9/10/2026. Nenhum push ou deploy executado pelo agente.

## Implementação

- Catálogo autorizado completo, incluindo arquivados, carregado por paginação de listProjects uma vez por conta/instância Functions durante a sessão/F5. Escopos all/work/personal derivam do mesmo catálogo; chamadas simultâneas compartilham a promessa. Não há persistência do catálogo em localStorage ou fallback direto ao Firestore.
- Cache isolado por UID/Functions; logout/troca de conta e CRUD de projetos/mesclagem de tópicos invalidam o catálogo. Respostas obsoletas são rejeitadas por geração. Falhas não ficam em cache; preview sem confirmação não invalida.
- ProjectSelector reutilizado em registros, calendário, relatórios pessoal/empresa e destino de mesclagem. Identificadores estáveis continuam na seleção/URL; não se exige digitar IDs. Busca usa apenas metadados já autorizados, inclusive quando a apresentação está oculta. Rótulos continuam mascarados; texto digitado fica em memória, não na URL.
- Consultas e seletores são descartados ao trocar conta/apresentação. Busca não é apagada ao mudar apenas estado/escopo. IDs desconhecidos exibem rótulo neutro, sem ampliar a seleção para todos.
- Cabeçalho contextual reutilizável agrupa título/contexto/ação, abas de escopo e filtros. Em Projetos, busca permanece habilitada, rótulos completos e ação de limpar sem quebra; botão Novo projeto fica dentro do bloco.
- Removido o termo “modo seguro” da interface e corrigido o aviso de 100 itens: catálogo paginado não tem limite total de 100. Registros continuam limitados a até 100 no dashboard; a igualdade com 100 não prova truncamento.
- Índices Map evitam buscas quadráticas de metadados por linha no dashboard.

## Validação técnica

Lint, typecheck frontend/backend, 242 testes backend, 43 testes frontend, 3 testes do gerador e diff check passaram. Build frontend concluído; bundle final index-B29mQjUv.js confirmado por HTTP (funcionais avaliados inicialmente em index-DWDgQAKy.js) no Hosting do emulador existente em 127.0.0.1:5000, sem reiniciar/importar dados. Testes cobrem deduplicação, isolamento, geração obsoleta, falhas, assinantes, busca autorizada com rótulo neutro, descarte da consulta e wrapper de mutações (preview/sucesso/falha). Revisão backend read-only não encontrou P1 adicional; testes puros não comprovam privacidade real do DOM. A revisão funcional local observou: pesquisa Horizonte retornando projeto autorizado com rótulo reservado e sem título original no textContent de main; seletor de registros com nomes legíveis; texto de pesquisa preservado na sequência assíncrona executada no calendário; um único POST listProjects ao navegar Projects→Records→Calendar→Dashboard na mesma sessão. Isso não comprova todos os cenários de concorrência, logout ou revogação externa. Aceite visual final fica no relatório do designer; duas falhas iniciais (título duplicado e posição da ação) foram corrigidas no bundle final e recapturadas/abertas em 1440 e 390 com PASS. O browser precisou de URL local com cache-buster para descartar HTML antigo; o script final foi conferido, não presumido.

## Limitações e fronteiras

- Alterações externas via MCP/outra sessão não invalidam automaticamente este cache em memória. Atualizar/F5 recarrega; nenhum TTL/autopoll foi introduzido. Mutações continuam revalidando ACL no servidor. O cache não substitui autorização do backend.
- Uma carga de catálogo pode conter várias páginas. O backend ainda rescaneia o catálogo global em cada página e conserva a guarda de 1000 projetos: esta entrega reduz consultas repetidas por remontagem, não o custo inicial ou essa guarda.
- Pendentes/bell/dashboard ainda consultam até 100 registros e filtram em memória. Auditoria é read-only; nenhum índice, backfill, novo estado derivado, consulta de registros ou cálculo personal-v3 foi alterado.
- Sem deploy concorrente, alteração de produção, importação, migração ou reescrita de histórico. Código de pausa preexistente continua fora da publicação feita pelo agente.

# Calendário — filtro pesquisável de projeto

Solicitação humana de 9/10/2026: pesquisar e filtrar o calendário por projeto, sem repaginar uma tela já aprovada.

## Implementação

- Controle Projeto com Autocomplete MUI, busca por rótulo, opção Todos os projetos e ação de limpar.
- IDs estáveis diferenciam projetos com títulos iguais. O seletor compartilhado recebe somente o catálogo autorizado: rótulos renderizados passam por safeProject; títulos/descrições originais servem apenas à pesquisa local, inclusive com apresentação oculta, conforme solicitação humana. Alternar a apresentação remonta a busca para não reter o texto digitado.
- projectId fica na URL; troca de data, dia/semana/mês, densidade, arquivados e retorno do registro preservam o filtro.
- O filtro utiliza o parâmetro projectId já suportado por getPersonalReport, sem alterar backend, ACL ou orçamento global personal-v3. A busca no seletor é local sobre o catálogo; não é busca textual no Firestore.
- Seleção por link cujo projeto ainda não está no catálogo permanece ativa com rótulo genérico, sem ampliar silenciosamente para todos.
- Nenhuma alteração no cálculo ou geometria da linha do tempo.

## Validação

Typecheck, lint, build, 31 testes frontend (5 novos), 242 testes backend e diff check passaram. Preview local confirmado com bundle index-C2yk9atH.js. Designer concluiu uma rodada finita desktop/mobile: busca/seleção Atlas, eventos filtrados, mudança de dia/semana/mês/data, reload, histórico e limpar. Seis capturas abertas estão registradas no checklist visual. Ressalva: um reset transiente do texto do seletor em navegação com resposta pendente foi observado; o seletor compartilhado solicitado em seguida trata explicitamente mudanças programáticas e será revalidado sem reabrir a geometria.

## Publicação

Não publicado pelo agente nesta entrega: usuário informou que está executando deploy. Nenhum deploy concorrente, criação de índice, migração, importação ou alteração de histórico foi executado. O commit desta melhoria será local, sem push.

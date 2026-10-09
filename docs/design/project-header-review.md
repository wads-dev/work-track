# Projetos — cabeçalho integrado e revisão localizada

## Pedido humano e estado

Novo pedido após screenshot de Projetos em dark/wide: título abaixo dos filtros, ação Novo projeto isolada, label truncado e Limpar filtros quebrando. Esta crítica substitui a aprovação anterior **nesta área**, sem reabrir o restante da aplicação. Tarefa53 concluída: guia implementado, rodada funcional executada e dois ajustes objetivos corrigidos/recapturados. Aceite final PASS no bundle B29mQjUv; histórico e limites abaixo.

## Composição prescrita

Um único bloco acima dos cards, com ordem de leitura e DOM: título/contexto → ação principal → escopo → filtros → informação de resultados. Não é pedido de FAB nem de redesenho global.

- Desktop1440/wide1726: primeira linha título Projetos22/650 e contexto curto14 à esquerda, Novo projeto à direita no mesmo container. Tabs de escopo abaixo se presentes; filtros em uma linha seguinte. Espaço16 e padding20–24, respeitando o max-width existente.
- Busca flexível com min-width:0 e base útil de aproximadamente280px. Outros campos com largura mínima que permita label inteiro; sem esconder label por ellipsis, reduzir fonte ou fixar dimensões incapazes de acomodar a tradução.
- Limpar filtros em coluna auto, texto nowrap, altura40 desktop/44 mobile; alinhado com os inputs, sem duas linhas e sem comprimir controles vizinhos.
- Mobile390: título/contexto antes das ações, Novo projeto fullwidth em linha própria **dentro do mesmo bloco**; filtros empilhados fullwidth, espaços12–16, controles44 e sem overflow horizontal.
- Dark: reutilizar tokens atuais de superfície/borda/texto. Não usar alerta dominante para instruções rotineiras. Dado de limite de resultados, se factual, fica como helper compacto junto da contagem.
- Remover o termo “modo seguro”, conforme pedido humano. Busca pode consultar títulos/descrições raw de projetos **já autorizados** mesmo quando sua apresentação estiver mascarada; não pode revelar conteúdo confidencial nos labels, sugestões ou resultados. Busca não amplia ACL.

## Gate da única revisão

Após READY do Lead: confirmar bundle servido local5000; screenshots reais do cabeçalho dark em1440,1726 e390, abrir cada imagem e julgar agrupamento, ordem, label integral, botão Limpar em uma linha, Novo projeto integrado, legibilidade/overflow. Validar busca autorizada com apresentação mascarada apenas se fixture adequada existir; documentar qualquer lacuna. Não autenticar em produção, não conceder OAuth, não alterar registros, não editar código/build/serve/deploy.

Estado final: **PASS localizado**, após correção dos dois achados e recaptura real do bundle B29mQjUv. Histórico dos gates abaixo.

## Rodada53 — DWDgQAKy, 9/10/2026

Bundle confirmado no browser após READY; somente local5000, colega. Nenhuma mutação de projeto/registro ou acesso à produção.

### Resultado visual: FAIL parcial, dois ajustes objetivos

Screenshots reais capturados e abertos: [1440dark](../../.playwright-mcp/project-header-dark-1440.png), [1726dark](../../.playwright-mcp/project-header-dark-1726.png), [390dark](../../.playwright-mcp/project-header-dark-390.png).

PASS: Estado dos projetos inteiro, Limpar filtros sem quebra, título/contexto acima dos filtros no bloco, ação fullwidth integrada no mobile, contraste e nenhuma barra horizontal na área.

FAIL: (1) segundo título “Projetos” continua abaixo dos filtros, duplicando o título principal; remover heading redundante da lista. (2) Novo projeto fica perto do centro no desktop, em vez da extremidade direita do header; wrapper de ação aparentemente reserva largura de formulário. Alinhar o botão à direita sem mudar modal/form. Lead autorizou esses dois ajustes e somente recapturas1440/390 após novo READY;1726 apenas se alinhamento ficar inconclusivo.

### Resultado funcional: PASS nos casos executados

- [Busca mascarada390](../../.playwright-mcp/project-header-masked-search-390.png): termo Horizonte encontra fixture confidencial já autorizada na resposta listProjects; campo habilitado, resultado continua Projeto reservado/Conteúdo oculto/Não informado. Nome raw não consta no textContent de main; termo digitado pertence ao input do usuário. Nenhuma revelação acionada.
- [Seletor de registros390](../../.playwright-mcp/records-project-selector-390.png): opções têm títulos ou Projeto reservado, nenhum design-demo-* exibido.
- [Pesquisa após navegação assíncrona390](../../.playwright-mcp/calendar-filter-async-search-dark-390.png): selecionar Atlas → próximo período → voltar → avançar → digitar Atlas; texto e opção continuam Atlas/Plataforma Atlas após captura. P2 anterior não reproduziu nesta sequência; não equivale a teste exaustivo de concorrência.
- Cache: network log após Projects→Records→Calendar→Dashboard contém apenas **um POST listProjects** (request7,200); reports separados requests12–15 não contam como catálogo. Mesma sessão SPA, sem reload entre rotas.

Estado: funcionais concluídos; browser liberado para Lead servir correções dos dois FAIL. Não repetir matriz nem rotas funcionais na recaptura.

## Recaptura objetiva — B29mQjUv — PASS final

Após novo READY, a primeira navegação simples reutilizou HTML antigo DWDgQAKy; por isso as imagens [nome fixed1440](../../.playwright-mcp/project-header-fixed-dark-1440.png) e [nome fixed390](../../.playwright-mcp/project-header-fixed-dark-390.png) **não mostram correção nem dark e não são evidência final**. A URL local /projects?release=B29mQjUv eliminou o cache stale; browser confirmou script index-B29mQjUv.js e apenas um heading Projetos no main. Tema dark novamente ativado antes de capturar.

Evidências finais capturadas **e abertas/vistas**: [desktop1440](../../.playwright-mcp/project-header-B29mQjUv-dark-1440.png) e [mobile390](../../.playwright-mcp/project-header-B29mQjUv-dark-390.png).

- PASS: título redundante abaixo dos filtros removido, lista agora começa diretamente após o bloco.
- PASS: Novo projeto alinhado à borda direita interna no desktop, fullwidth e integrado no mobile.
- PASS: label Estado dos projetos continua inteiro, Limpar filtros continua em uma linha, hierarquia título/contexto/ação/tabs/filtros preservada sem overflow.

Nenhuma necessidade de outra captura1726: alinhamento1440 é inequívoco. Nenhuma repetição dos funcionais anteriores, cuja evidência permanece explicitamente ligada a DWDgQAKy. Sem mudança em source/build/serve/deploy ou fixtures. Browser liberado, tarefa53 concluída, STOP.

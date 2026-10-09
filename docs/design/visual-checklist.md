# Auditoria visual — evidência e gate

## Método e situação

Designer é o único operador Browser Navigator. Todos os links abaixo foram capturados por Playwright e abertos com read_image; crítica é baseada em pixels vistos. DOM apenas para navegação/espera/medidas. Não há aprovação final do redesign.

Baseline essencial D3 em localhost5000, conta synthetic frontend.review@wads.dev. Dados iniciais demo4 registros; seed enriquecido7projetos44registros entrou antes das capturas calendário semana. Baselines app/me/projects/records etc não são comparação numérica apples-to-apples com faseA, mas são evidência de layout. Capturas fullPage de overlays incluem página por baixo após limite da viewport; isso é artefato de screenshot, não vazamento do modal. Banner Firebase é visível nas evidências e não deve ser simplesmente escondido.

## Todas as rotas principais — baseline aberto e visto

| Rota/estado    | Desktop                                                      | Mobile                                                     | Baseline | Depois         |
| -------------- | ------------------------------------------------------------ | ---------------------------------------------------------- | -------- | -------------- |
| app            | [1440](../../.playwright-mcp/before-app-1440.png)            | [390](../../.playwright-mcp/before-app-390.png)            | Visto    | Pendente final |
| me             | [1440](../../.playwright-mcp/before-me-1440.png)             | [390](../../.playwright-mcp/before-me-390.png)             | Visto    | Pendente final |
| projects       | [1440](../../.playwright-mcp/before-projects-1440.png)       | [390](../../.playwright-mcp/before-projects-390.png)       | Visto    | Pendente final |
| records        | [1440](../../.playwright-mcp/before-records-1440.png)        | [390](../../.playwright-mcp/before-records-390.png)        | Visto    | Pendente final |
| pending        | [1440](../../.playwright-mcp/before-pending-1440.png)        | [390](../../.playwright-mcp/before-pending-390.png)        | Visto    | Pendente final |
| rules          | [1440](../../.playwright-mcp/before-rules-1440.png)          | [390](../../.playwright-mcp/before-rules-390.png)          | Visto    | Pendente final |
| project-detail | [1440](../../.playwright-mcp/before-project-detail-1440.png) | [390](../../.playwright-mcp/before-project-detail-390.png) | Visto    | Pendente final |
| record-page    | [1440](../../.playwright-mcp/before-record-page-1440.png)    | [390](../../.playwright-mcp/before-record-page-390.png)    | Visto    | Pendente final |
| record-drawer  | [1440](../../.playwright-mcp/before-record-drawer-1440.png)  | [390](../../.playwright-mcp/before-record-drawer-390.png)  | Visto    | Pendente final |
| pending-editor | [1440](../../.playwright-mcp/before-pending-editor-1440.png) | [390](../../.playwright-mcp/before-pending-editor-390.png) | Visto    | Pendente final |
| calendar-month | [1440](../../.playwright-mcp/before-calendar-month-1440.png) | [390](../../.playwright-mcp/before-calendar-month-390.png) | Visto    | Pendente final |
| calendar-week  | [1440](../../.playwright-mcp/before-calendar-week-1440.png)  | [390](../../.playwright-mcp/before-calendar-week-390.png)  | Visto    | Pendente final |
| oauth-login    | [1440](../../.playwright-mcp/before-oauth-login-1440.png)    | [390](../../.playwright-mcp/before-oauth-login-390.png)    | Visto    | Pendente final |

Rotas de detalhe: /projects/frontend-review-demo; /records/demo-open; /records?record=demo-closed; /pending?record=demo-open. Calendário month/week: date=2026-10-08, view=month&density=supercompact ou view=week&density=compact. OAuth=/login semflow: estado sem solicitação, NÃO autorização completa. [Menu390](../../.playwright-mcp/before-menu-390.png) também aberto/visto.

## Achados priorizados

1. **P0 Mobile edição:** botão FECHAR quebra, camadas reduzem largura útil e salvar fora viewport.
2. **P0 Drawer:** estado inicial fechado mostra cabeçalho e grande vazio; Detalhes precisa abrir por padrão, tabs reais.
3. **P1 Projeto:** arquivar precede relatório; métrica mobile~750px, gráficos~1400px. Leitura deve vir primeiro, gestão em tab.
4. **P1 Calendário390:** mês42cardsverticais e3517pxaltura, sem estrutura calendário reconhecível. Semana compacta ainda1720px. Desktop semana colunas altas/pills e uppercasetexto pesado.
5. **P1 Listas390:** dados/ações à direita cortados; transformar em rows/cards mobile.
6. **P1 Dashboard:** total semlabel, checkboxsolto, pizza204px em card1392px, espaço vazio excessivo e bulletlists.
7. **P1 Regras:** linha desktop~1300px, mobile2521px sem sumário. Blocos temáticos e maxwidth840.
8. **P1 Menu:** açõesantesnav, Infoicontriplicado, calendárioúltimo, semgrupos.
9. **P1 OAuth:** identidade dark desconectada e loading+erro simultâneos semflow.

## Fase A — revisão intermediária, NÃO aprovação final

Bundle servido index-BNQH_IsO.js confirmado por scriptsURL após queryreview=phaseA-0523.

| Estado                  | Desktop                                                      | Mobile                                                     | Conclusão                                                      |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Shell/toolbar dashboard | [1440](../../.playwright-mcp/phaseA-app-1440.png)            | [390](../../.playwright-mcp/phaseA-app-390.png)            | Labeltotal e shellmelhores; toolbarpill/gridquebrado ainda     |
| Drawer detalhes         | [1440](../../.playwright-mcp/phaseA-record-drawer-1440.png)  | [390](../../.playwright-mcp/phaseA-record-drawer-390.png)  | Tabs reais e detalhesdefault corrigem vazio; hierarquia melhor |
| Editar pendência        | [1440](../../.playwright-mcp/phaseA-pending-editor-1440.png) | [390](../../.playwright-mcp/phaseA-pending-editor-390.png) | Form limpo; P0 salvar390 oculto sob banneremulador; desktopok  |

P1 adicionais: remover emailduplicado nav/header, ícones específicos em vez Info repetido, agrupar Trabalho/Gestão e mover Calendário antes Projetos; toolbar radius12 não36, mobile métrica span2 depois datas grid2. Redesign de gráficos/listas/projeto/calendário ainda em implementaçãoB.

## Checklist final obrigatório — pendente até screenshots vistos

- [ ] Todas as linhas da matriz: desktop1440+mobile390 depois.
- [ ] Desktop1280 sanity shell/toolbar/modal; mobile sem overflow do body.
- [ ] Meu relatório diferenças escopo, dashboard pessoas e distribuição compacta.
- [ ] Projeto tabs Visão geral/Gestão; metadata, arquivados, confidencial, mergepreview sem confirmar mutation.
- [ ] Calendário mês, semana, supercompact/compact/timeline, gaps>=4h collapse/expand, crossmidnight e overlaps.
- [ ] Dialog calendário + Drawer lista + página integral: close/back preserva origem/filtros/período.
- [ ] Editar início preservado/fim vazio/motivoobrigatório/confirmacaonecessária; reopenclosed explícito; sem salvar registro real.
- [ ] Histórico populado e estado oculto modo seguro.
- [ ] Menu mobile, sidebar desktop, temaescuro, foco/keyboard, safe mode fechado/revelado (dados sintéticos).
- [ ] Login SPA deslogado; OAuth semflow, inválido, consentválido sem concessão.
- [ ] Empty, erroregional/retry, loading; partial/globalbudget error sem esconder integridade.
- [ ] Tooltips/ARIA/confidenciais preservados (complementoDOM permitido, pixels são gate visual).

## Stack e referências

Base atual: shadcn/ui + Tailwind CSS v4 + Radix, Geist selfhosted e Lucide uniforme. Referências somente leitura: [GolderUnicorn tokens](/Users/bizup/GitRepos/wads.dev/GolderUnicornFinanceControl/Web/src/components/Vars.css), [web-admin design-system](/Users/bizup/GitRepos/bizup-hub-mobile/web-admin/src/shared/design-system/styles.css) e [mobile-hub tipografia](/Users/bizup/GitRepos/bizup-hub-mobile/mobile-hub/src/global.css). Camadas suaves/escalaespaços e composição consistente inspiram; sem copiar código.

## Fase B — cobertura principal concluída (2026-10-09)

Bundle servido index-Dh5V5Fhr.js confirmado. Após recriação externa do container, fixture nativa substituiu os registros demo antigos: projeto design-demo-plataforma, registro fechado design-demo-record-001, aberto040. Sessão sintética restaurada via Auth Emulator local. OAuth consent apenas inspecionado; NÃO concedido. Diferença de totais A/B decorre de datasets diferentes, não é evidência de regressão de cálculo.

26 screenshots capturados, abertos e vistos: 13 estados x1440/390.

| Estado         | Desktop                                                       | Mobile                                                      | Evidência      |
| -------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| login          | [1440](../../.playwright-mcp/after-B-login-1440.png)          | [390](../../.playwright-mcp/after-B-login-390.png)          | Aberto e visto |
| oauth-consent  | [1440](../../.playwright-mcp/after-B-oauth-consent-1440.png)  | [390](../../.playwright-mcp/after-B-oauth-consent-390.png)  | Aberto e visto |
| app            | [1440](../../.playwright-mcp/after-B-app-1440.png)            | [390](../../.playwright-mcp/after-B-app-390.png)            | Aberto e visto |
| me             | [1440](../../.playwright-mcp/after-B-me-1440.png)             | [390](../../.playwright-mcp/after-B-me-390.png)             | Aberto e visto |
| projects       | [1440](../../.playwright-mcp/after-B-projects-1440.png)       | [390](../../.playwright-mcp/after-B-projects-390.png)       | Aberto e visto |
| project-detail | [1440](../../.playwright-mcp/after-B-project-detail-1440.png) | [390](../../.playwright-mcp/after-B-project-detail-390.png) | Aberto e visto |
| records        | [1440](../../.playwright-mcp/after-B-records-1440.png)        | [390](../../.playwright-mcp/after-B-records-390.png)        | Aberto e visto |
| record-page    | [1440](../../.playwright-mcp/after-B-record-page-1440.png)    | [390](../../.playwright-mcp/after-B-record-page-390.png)    | Aberto e visto |
| pending        | [1440](../../.playwright-mcp/after-B-pending-1440.png)        | [390](../../.playwright-mcp/after-B-pending-390.png)        | Aberto e visto |
| pending-editor | [1440](../../.playwright-mcp/after-B-pending-editor-1440.png) | [390](../../.playwright-mcp/after-B-pending-editor-390.png) | Aberto e visto |
| rules          | [1440](../../.playwright-mcp/after-B-rules-1440.png)          | [390](../../.playwright-mcp/after-B-rules-390.png)          | Aberto e visto |
| calendar-month | [1440](../../.playwright-mcp/after-B-calendar-month-1440.png) | [390](../../.playwright-mcp/after-B-calendar-month-390.png) | Aberto e visto |
| calendar-week  | [1440](../../.playwright-mcp/after-B-calendar-week-1440.png)  | [390](../../.playwright-mcp/after-B-calendar-week-390.png)  | Aberto e visto |

### Veredito B por área

- Login SPA e OAuth consent: aprovado visual, hierarquia clara e CTA legível nos dois breakpoints.
- Dashboard: duas colunas/barras/sidebar/toolbar melhoraram; defeito factual centro do donut preto enviado para correção C.
- Meu relatório: aprovado pelo usuário/congelado; somente regressão do donut compartilhado.
- Projetos/listas de registros: cards mobile eliminam colunas cortadas; responsividade aprovada. Toolbar desktop ainda tem campo inativo muito largo e Limpar em duas linhas (P2, não bloqueia nem abre ronda estética adicional).
- Projeto visão geral: tabs corretas e métrica primeiro; quatro avisos rotineiros amber empurram gráficos (mobile primeiro gráfico~1300px). Correção localizada C, sem remover avisos de integridade reais.
- Pendências lista: aprovado desktop/mobile, contagem e escopo preservados; editor1440 aprovado. **Editor390 mantém P0 botão salvar sob banner Auth Emulator**, enviado C, não é gate global aprovado.
- Registro página: detalhes claros/tabulação real, aprovado visual. Edição/histórico extras ainda precisam teste pós-C de URLs.
- Regras: maxwidth e sumário melhoram leitura; aprovado sem novo P0; conteúdo longo é legítimo.
- Calendário: geometria e tipografia congeladas por aprovação humana. Semana foi observada em density=timeline/Régua, baseline semana em compact; não confundir os estados. Mês390 supercompact mostra pontos de eventos; rótulos são comprimidos. Única área reaberta pelo humano é contexto da toolbar.
- Nas sete rotas finais mobile (me/projects/records/pending/rules/record-page/calendar-month), DOM complementou screenshots confirmando body.scrollWidth=390 e viewport=390.

### Evidência auxiliar A

[Dark1280](../../.playwright-mcp/phaseA-dark-1280.png): contraste de texto adequado e sem overflow; ícone nativo de data preto em dark reportado para C. [Foco tabs390](../../.playwright-mcp/phaseA-tab-focus-390.png): ArrowLeft move foco, Enter ativa Editar, Escape fecha preservando query de origem. Histórico seguro exibe aviso de ocultação adequado.

### Pendências honestas após B

Drawer fechado B, diálogo calendário, gestão/merge preview, histórico populado/revelado, empty/error/loading, OAuth semflow/invalid depois, dark depois, teclado/URLs pós-C e savebanner apósC. Não equivalem a rotas inteiras não auditadas: as principais acima foram realmente vistas.

### Governança atualizada pelo usuário

Máximo **6 rodadas por rota/estado**, não3. Nova rodada apenas após frontend dizer explicitamente que o tópico está terminado/pronto e Lead confirmar bundle servido. Aprovados congelados, reabertura só da área afetada por nova funcionalidade ou falha factual funcional/privacidade/acessibilidade. B foi explicitamente declarado READY antes destas capturas; nenhuma revisão de C em andamento foi realizada. O registro canônico de rodadas é mantido pelo Lead separadamente.

## Fase C — correções localizadas concluídas

2026-10-09. Frontend declarou término e Lead confirmou preview antes de começar. Browser confirmou index-Bmf_Lz1l.js. Sem submit de edição/arquivo/merge. Runtime liberado ao Lead para D após lote finito.

| Correção/estado              | Evidência aberta e vista                                                                                                      | Veredito                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Editor mobile                | [390](../../.playwright-mcp/after-C-pending-editor-390.png)                                                                   | P0 resolvido: Save y737–777, aviso começa794;17px livres.                                                              |
| Dashboard donut              | [1440](../../.playwright-mcp/after-C-app-1440.png) / [390](../../.playwright-mcp/after-C-app-390.png)                         | Centro agora segue superfície: aprovado.                                                                               |
| Projeto visão geral          | [1440](../../.playwright-mcp/after-C-project-detail-1440.png) / [390](../../.playwright-mcp/after-C-project-detail-390.png)   | 4 avisos rotineiros convertidos em Notas do cálculo colapsadas; correção aprovada.                                     |
| Calendar toolbar             | [1440](../../.playwright-mcp/after-C-calendar-week-1440.png) / [390](../../.playwright-mcp/after-C-calendar-week-390.png)     | Superfície coesa contextualiza controles; aprovado no escopo, geometria intacta.                                       |
| Projeto detalhes inline      | [1440](../../.playwright-mcp/after-C-project-edit-1440.png) / [390](../../.playwright-mcp/after-C-project-edit-390.png)       | Formulário visível direto na tab, sem botão Gerenciar solto; aprovado. Metadados+merge legíveis.                       |
| Arquivar, confirmação inline | [1440](../../.playwright-mcp/after-C-archive-confirm-1440.png) / [390](../../.playwright-mcp/after-C-archive-confirm-390.png) | Motivo e checkbox explícitos, CTA desabilitado; aprovado visual, nenhuma mutação. Não é diálogo modal.                 |
| Histórico seguro             | [1440](../../.playwright-mcp/after-C-history-safe-1440.png) / [390](../../.playwright-mcp/after-C-history-revealed-390.png)   | Aviso correto e legível nos2. **Nome revealed é artefato de tentativa: imagem mostra seguro, não histórico populado.** |
| Dark1280                     | [1280](../../.playwright-mcp/after-C-dark-1280.png)                                                                           | Contraste de textos e native date icons claros; donut usa superfície dark; aprovado.                                   |

Testes complementares C: pending recordTab=history/details muda com clique, reload mantém Detalhes. Projeto Detalhes/Editar gera tab=details. Escape no drawer remove record e mantém query de origem (recordTab permanece como estado). Esses testes não substituem screenshots.

Capturas C=15 arquivos (inclui duplicate1440 cujo nome history-revealed é incorreto, não conte como estado extra). Governança: não abrir nova rodada para áreas aprovadas. B permanece26 capturas, coletadas antes de publicação C.

**Gate ainda não integral:** histórico populado/revelado, loading/empty/error, menu after, OAuth invalid/semflow, merge preview retornado e fluxos pessoais/ACL novos D não foram validados em C. Não chamar isso de revisão final completa. Frontend/Lead estão implementando acesso pessoal real; a privacidade cosmética vista em B/C não demonstra autorização do backend.

## Fase D — acesso pessoal e histórico, lote finito

Preview index-BTkKlKSR.js confirmado no browser. Dez screenshots capturados, abertos e inspecionados; nenhuma criação/edição/arquivo pelo browser. Fixture pessoal isolada de2docs criada pelo backend a pedido do Lead; cleanup solicitado ao concluir.

| Estado                           | Evidência                                                                                                                       | Resultado                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Novo projeto, acesso obrigatório | [1440](../../.playwright-mcp/after-D-project-create-1440.png) / [390](../../.playwright-mcp/after-D-project-create-390.png)     | Legível e sem overlap. Título+descrição válidos semscope mantêm CTA disabled. Opções explícitas Pessoal somente dono/Corporativo compartilhado. Nenhum submit. |
| Meus projetos pessoais vazio     | [1440](../../.playwright-mcp/after-D-personal-empty-1440.png) / [390](../../.playwright-mcp/after-D-personal-empty-390.png)     | Empty real antes da fixture. scope=personal na URL; reload mantém tab selecionada.                                                                             |
| Histórico realmente revelado     | [1440](../../.playwright-mcp/after-D-history-revealed-1440.png) / [390](../../.playwright-mcp/after-D-history-revealed-390.png) | Toggle revelar + navegação client-side real. Card auditoria com motivo, autor, antes/depois legível; agora sim populado.                                       |
| Owner vê pessoal                 | [1440](../../.playwright-mcp/after-D-personal-owner-1440.png) / [390](../../.playwright-mcp/after-D-personal-owner-390.png)     | Conta frontend.review vê exatamente privatefixture.                                                                                                            |
| Colega não vê pessoal do owner   | [1440](../../.playwright-mcp/after-D-colleague-personal-1440.png)                                                               | Logout/login Google emulator real para demo.colleague; mesmaURL scope=personal vazia, badge0, sem dados remanescentes do owner na lista.                       |
| Colega URL direta negada         | [1440](../../.playwright-mcp/after-D-colleague-denied-1440.png)                                                                 | Erro regional genérico/retry, sem título/descrição/tempo privado. Cabeçalho ecoa ID inserido pelo teste na URL; neutralização planejada em E.                  |

**Limite exato:** UI prova lista pessoal owner/colleague e URL direta negada. Não prova todos consumers, trânsito/loading quadro-a-quadro, caches em todas rotas, relatórios/calendário/filter da conta alternada nem regras reais. Lead informou integração separada2UID31checks, sem confundir com screenshots. Full loading/error/network/retry e OAuth invalidflow ainda não inspecionados. D runtime liberado imediatamente após último lote; nenhuma nova estética solicitada.

## Fase E — assuntos, gerenciamento e correção localizada

E1 index-C_AShFyv.js confirmado no browser; E2 index-BohQojQt.js confirmado após refresh. Oito screenshots E1 e dois E2 foram capturados, abertos e vistos.

| Estado                                   | Desktop                                                           | Mobile                                                          | Veredito                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Company assunto Plataforma Atlas/Entrega | [1440](../../.playwright-mcp/after-E-company-topic-1440.png)      | [390](../../.playwright-mcp/after-E-company-topic-390.png)      | PASS. Total39,08h; assunto9,17h. URL par projectId/topicId preservado por reload.                                              |
| Projeto assunto selecionado E1           | [1440](../../.playwright-mcp/after-E-project-topic-1440.png)      | [390](../../.playwright-mcp/after-E-project-topic-390.png)      | Desktop reprovado: coluna pessoa~110px, texto uma palavra/linha, donut~50px. Mobile PASS. Back/forward restaura seleção/todos. |
| Meu relatório conta colega               | [1440](../../.playwright-mcp/after-E-personal-topic-1440.png)     | [390](../../.playwright-mcp/after-E-personal-topic-390.png)     | PASS. Total3,5h; assunto1,75h e Você, não dados do owner. Seleção persiste reload.                                             |
| Gerenciamento do projeto                 | [1440](../../.playwright-mcp/after-E-project-management-1440.png) | [390](../../.playwright-mcp/after-E-project-management-390.png) | PASS. Header sem UID, escopo compartilhado explícito, tipo disabled não conversível. Nenhuma mutação.                          |
| Projeto corrigido E2                     | [1440](../../.playwright-mcp/after-E2-project-columns-1440.png)   | [390](../../.playwright-mcp/after-E2-project-columns-390.png)   | PASS. Duas colunas equivalentes~548px; donut136, texto legível, mobile empilhado sem overflow.                                 |

E liberado depois do E2; relatórios/calendário congelados não foram repaginados pelo audit. Fixture privada2docs cleanup liberado ao backend. Não revalidado em E: auditAuthorPessoa drawer, todos estados de erro/loading, todos caminhos contextuais calendário, ownerpersonalreport contendo privatefixture.

### Ressalva de identidade B

Os últimos sete screenshots mobile de B foram abertos e inspecionados, mas o hash servido não foi explicitamente reconsultado entre eles. Não promovê-los a prova independente de identidade do bundle. C/D/E têm confirmações específicas registradas acima.

## Produção P — smoke visual público encerrado

URL https://wadsworktrack.web.app/?release=9e64b8d; script servido index-BohQojQt.js confirmado no browser. [Login1440](../../.playwright-mcp/production-login-1440.png) e [login390](../../.playwright-mcp/production-login-390.png) capturados, abertos e inspecionados: PASS, card/CTA/textos legíveis, semoverflow e sembanneremulator. Nenhum click Google, autenticação, consentimento, troca de conta ou escrita em produção. Esta prova é **somente login público**, não auditoria autenticada em produção.

## Filtro de projeto no calendário — revisão funcional única, local

READY do Lead e hash servido/browser index-C2yk9atH.js, backend anterior sem mudança. Conta colega demo, nenhum acesso de produção/OAuth ou alteração de registro. Escopo somente novo autocomplete; calendário aprovado permanece congelado.

**PASS:** pesquisar Atlas restringe opção a Plataforma Atlas; selecionar escreve projectId=design-demo-plataforma; reload recupera seleção depois dos dados carregarem. Semana mostra apenas Atlas1,75h; Dia/Régua em8/10 mostra apenas Atlas0,5h. Mudança de data8→9, visualizações Dia/Mês e back/forward preservamprojectId; voltar/avançar após limpar restaura/remove seleção respectivamente. Apagar entrada e botão Mostrar todos os projetos removemprojectId, mantendo data/view/density e restaurando3projetos.

Evidências capturadas, abertas e vistas:

- [Semana1440](../../.playwright-mcp/calendar-filter-week-1440.png) — filtro e resultado carregados.
- [Régua1440](../../.playwright-mcp/calendar-filter-timeline-1440.png) e [régua390](../../.playwright-mcp/calendar-filter-timeline-390.png) — Atlas selecionado, apenas sua atividade; filtro cabe semoverflow.
- [Limpo390](../../.playwright-mcp/calendar-filter-cleared-390.png) — Todos os projetos e3atividades restituídas.
- [Pesquisa390 estabilizada](../../.playwright-mcp/calendar-filter-search-settled-390.png) — entrada Atlas e opção correspondente legíveis.
- [Pesquisa390 transitória](../../.playwright-mcp/calendar-filter-search-390.png) **não é evidência de pesquisaAtlas**: depois de back/forward imediato houve reset para Todos os projetos entre a leitura do DOM e a captura, possivelmente por resultado assíncrono anterior; repetição com dados já carregados funcionou. Causa não investigada neste lote limitado; ressalva P2 enviada ao Lead.

Limites: não houve conta com estimativa aberta neste recorte; preservação do orçamento global e privacidade backend são auditoria independente. Não foram reabertos estilos, densidade, recortes do calendário ou todas combinações de máscara/arquivados. Browser liberado após uma rodada.

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

Lead aprovou MUI custom + Geist selfhosted + Lucide uniforme. Referências somente leitura: [GolderUnicorn tokens](/Users/bizup/GitRepos/wads.dev/GolderUnicornFinanceControl/Web/src/components/Vars.css), [web-admin design-system](/Users/bizup/GitRepos/bizup-hub-mobile/web-admin/src/shared/design-system/styles.css) e [mobile-hub tipografia](/Users/bizup/GitRepos/bizup-hub-mobile/mobile-hub/src/global.css). Camadas suaves/escalaespaços e composição consistente inspiram; sem copiar código.

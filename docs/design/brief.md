# Work Track — direção visual e critérios de aceite

## Direção: workspace operacional calmo

A aplicação deve parecer uma ferramenta de trabalho coesa, não uma coleção de formulários sem hierarquia. A primeira leitura de cada tela é **onde estou → período/escopo → dado principal → ação**. Nada de superfícies enormes com conteúdo isolado, botões textuais soltos, títulos repetidos ou alertas de rotina. Biblioteca não resolve hierarquia: Base atual: shadcn/ui real (new-york), Tailwind CSS v4 e Radix, Geist self-hosted e Lucide uniforme, com tokens CSS claro/escuro e componentes compostos centralizados.

## Diagnóstico visual inicial (imagens realmente vistas)

- Dashboard1440: total6,5h sem rótulo; filtro arquivados sozinho numa segunda linha; pizza enorme monocromática isolada em card largura total; pessoa em outro card quase vazio. Falta densidade e estrutura.
- Editor pendência1440: ações navegação se parecem com tabs mas são botões; alerta aberto + painel elevado + alerta confirmação competem com formulário.
- Editor390: botão FECHAR quebra em duas linhas; só278px úteis dentro de camadas aninhadas; três ações empilhadas e aviso ocupam primeiro terço; salvar fica fora da viewport. É P0 de responsividade.
- Baseline essencial recapturado após confirmação D3 do Lead: 13 pares de screenshots1440/390 mais menu. Consulte [matriz de evidências e gate](visual-checklist.md). Fase A revisada com bundle BNQH_IsO; melhorias intermediárias não são aprovação final.

## Tokens obrigatórios

- Fonte: Geist self-hosted aprovada pelo Lead; fallback system-ui/-apple-system/Segoe UI; sem dependência de CDN. Body14px/1,5; helper12px; label12px/600; seção16px/600; título22px/650; métrica30px/650 com números tabulares.
- Espaço escala4/8/12/16/24/32. Container max1440px; padding24 desktop,16 mobile. Entre toolbar e conteúdo16; entre cards16; interior cards20 desktop/16 mobile.
- Light: canvas#F6F7F9, surface#FFFFFF, inset#F1F3F6, border#E2E6EC, text#172033, secondary#667085, primary#3158D5. Dark: canvas#11141B, surface#191E28, inset#222936, border#303849, text#EDF1F7, secondary#A6B0C2, primary#9EB3FF.
- Radius card12/input8/button8/chip6. Evitar pill em todos os controles. Card border1px, sombra nenhuma; overlay sombra apenas. Header opaco ou vidro sutil, jamais gradiente decorativo de fundo.
- Inputs40px e IconButton40px desktop; mobile targets44px. Botões sentence case, peso600. Ícone20px, família consistente. Status: neutro=fechado, amber=aberto/estimativa, red=erro; cores não são único sinal.

## Componentes e composição

### AppShell

Header64px desktop/56px mobile. À esquerda hamburger40, Work Track e breadcrumb página (mobile só página). À direita controles tema/notificação/modo seguro em grupo com divisória opcional e avatar/email desktop. Sem logout solto; dentro menu. Menu280px com marca, seção Trabalho (Dashboard/Meu relatório/Calendário), Gestão (Projetos/Meus registros/Pendências), Regras e perfil/saída rodapé. Item ativo fundo primary8%, ícone e peso600.

### PageToolbar / FilterBar

Uma superfície com border/radius12/padding12–16 que incorpora métrica e filtros. Métrica label acima (Tempo registrado), valor e pequeno contexto. Filtros agrupados e alinhados: datas opcionais, projeto, arquivados (no grupo avançado ou junto filtros), refresh ícone. Info cálculos em ícone contextual. Não deixar checkbox em linha própria solta. No390: métrica + refresh na primeira linha; ação Filtros e resumo de escopo; filtros abertos grid2 com projeto span2.

### Dashboard e relatórios

Grade desktop2col (2fr/1fr ou1/1); mobile1col. Card distribuição título/total + donut160px (não pizza cheia enorme) ao lado lista de legendas com dot/nome/horas/% e barras discretas. Um projeto só: barra ou donut adequado sem ocupar400pxaltura. Pessoas: linhas alinhadas, barra horizontal e valor à direita; nenhum bulletlist genérico. Sem projetos=empty state integrado, sem card vazio gigante. Totais honestos ao escopo/backend; partial crítico sempre visível.

### Tables / Lists

Toolbar da lista dentro mesmo card; header12px/600 neutro; row56px desktop; ação final icon40 com label acessível. Hover discreto e linha clicável quando apropriado. Mobile registros/pendências viram linhas/cards de conteúdo (projeto+status; início/fim; ação), não tabela comprimida com overflow body. Busca/estado da lista numa barra coesa.

### DetailPanel e editor — prioridade P0

Mesma anatomia em drawer desktop520–560px, dialog640px, página max960px. Mobile dialog full-screen com header56px, closeIcon44 sem texto quebrável, padding16 e footer de ação sticky. Não aninhar Paper elevado dentro do dialog. Cabeçalho: nome projeto, período, status compacto. Abaixo **Tabs reais Detalhes | Editar | Histórico**; aba ativa sublinhada, sem expand/collapse de seções principais. Página completa é icon/link secundário no cabeçalho, não uma terceira aba/ação textual enorme. Pendência abre Editar; lista/calendário abre Detalhes.
Form: fim real, helper curto, motivo, resumo antes→depois compacto + confirmação explícita preservada; Salvar primário e Cancelar secundário no footer. Reabertura é ação secundária explícita, nunca pré-preenchimento de fim nem encerramento automático. Audit/textos vão em Detalhes/Histórico, não alertas. Estado aberto vira chip; regra de estimativa frase muted com linkRegras, não banner amber por rotina.

### Projeto

Breadcrumb + nome + status + menu de ações. Tabs **Visão geral | Registros/tópicos disponíveis | Configurações** conforme funcionalidades existentes, sem inventar fetching/feature. Relatório em Visão geral. Editar metadata e arquivar na área Configurações; mesclar numa seção de operações sensíveis com preview e confirmação, nunca botão primário concorrendo com leitura. Não precisa criar tab Registros se não houver dados existentes.

### Calendário

Um card com toolbar integrada: setas, mês/semana referência, controle Semana/Mês, densidade select PT, overflow filtros, refresh. Grade abaixo sem copy técnico. Desktop1linha; mobile2linhas deliberadas. Label dias12px; hoje indicação contida. Legenda compacta em rodapé. Preservar geometria real, sobreposições, gaps globais>=4h e expansão alinhada. Scroll horizontal só dentro timeline quando indispensável; nunca body. Supercompact mobile prefer semana7col legível com dots e títulos truncados e tooltip, não cards vazando.

### Regras / Login / estados

Regras com leitura max840px, sumário/tabs se necessário, seções numeradas e exemplos curtos, sem parede de Alerts. Login card420px, marca, título Entrar no Work Track, ação Google inequívoca, elegibilidade discreta. Empty state: ícone32, título16 e texto14, sem dashboardinventado. Loading skeleton do layout final; erro regional com retry; crítica de integridade/partial não é escondida.

## Guardrails funcionais

Modo seguro fechado por sessão e sanitização em textos/tooltips/ARIA; sem redados confidenciais nos screenshots. Preserve URLs/filtros/return, dialog sobre mesma rota origem, histórico e auditoria. Não alterar cálculo8h global/estimativas, fatos, limiares15min, lacunas, seleção arquivados; não inventar fim. Motivo e confirmação obrigatórios em mutações. LoginOAuth estático deve permanecer funcional.

## Ordem de implementação

1. Tokens/AppShell/FilterBar + DetailPanel responsivo/tabs (P0).
2. Dashboard gráficos/grade e listas responsivas (P1).
3. Projeto/configurações, calendário, Regras/login/estados (P1).
4. Revisão screenshots desktop1440 e390 por todas rotas + dark/focus/overflow (gate, não opcional).

## Referências locais

Inspecionados [tokens GolderUnicorn](/Users/bizup/GitRepos/wads.dev/GolderUnicornFinanceControl/Web/src/components/Vars.css) (camadas leves/espaços), [mobile-hub](/Users/bizup/GitRepos/bizup-hub-mobile/mobile-hub/src/global.css) (stack tipográfico) e composição de [web-admin design-system](/Users/bizup/GitRepos/bizup-hub-mobile/web-admin/src/shared/design-system/styles.css) (grupos de controles/login). Não copiar visual genericamente nem importar código.

## Refinamento solicitado pelo usuário — projeto

Replicar o padrão real de abas do registro. Aba principal é o dashboard DO projeto, com gráficos/pessoas/relatório inteiramente project-scoped. Aba Detalhes/Editar reúne título, descrição, repositório Git e confidencialidade. Arquivar deve ser ícone secundário com tooltip e confirmação explícita, nunca um card dominante antes do relatório. Confidencialidade continua apresentação, não autorização. Formulários mantêm motivo, antes/depois e confirmação quando exigidos.

## Resultado finito B–E

B percorreu13estados desktop/mobile; C corrigiu footer móvel, composição de projetos/toolbar, edição inline e contraste dark sem reabrir Meu Relatório/calendário congelados. C não provou histórico revelado: arquivos com esse nome continham modo seguro, conforme checklist. D confirmou escolha de acesso obrigatória sem default, tab pessoal persistente naURL/reload, lista vazia, lista privada owner e ausência para colega após troca real de identidade no emulator; URL direta negada sem título/descrição/horas. Histórico populado foi finalmente aberto e visto em D.

E acrescentou distribuição por tópico qualificada pelo projeto. Company/personal/projeto foram inspecionados1440/390; URL contém par projectId/topicId, reload e back/forward funcionaram nos casos descritos no [checklist](visual-checklist.md). Uma regressão concreta deixou coluna de pessoas~110px no desktop; corrigida pontualmente em E2(index-BohQojQt.js): cards iguais~548px e mobile empilhado preservado. Não houve novo ciclo estético. Nenhum submit de trabalho real, arquivo ou consentimento OAuth foi executado pelo designer.

Esta é aprovação visual/funcional **dos estados enumerados**, não certificação de segurança nem cobertura exaustiva. Testes backend/regras e release pertencem ao Lead; lacunas constam da matriz.

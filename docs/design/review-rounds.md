# Revisões por rota e condição de parada

## Regra do gestor (pedido humano de 9 de outubro de 2026)

- Máximo de **6 rounds de revisão visual por rota/estado** na mesma entrega. Desktop e mobile são evidências do mesmo round, não rodadas adicionais. A coleta inicial de baseline é diagnóstico, não round de polimento.
- Um round só pode começar após liberação explícita do frontend: **“terminei este tópico, pronto para revisão”**, com rota/área concluída e build correspondente servido no preview confirmado pelo Lead. Código em andamento, build antigo ou revisão de tópico não liberado não inicia round nem gera nova lista de críticas. Registrar mensagem de liberação/build junto do round.
- Um round exige build identificado, evidência realmente capturada/aberta e lista finita de achados com decisão. Uma captura ainda não revisada **não conta como aprovação**.
- Estados: **não revisada após redesign**, **aguardando correção**, **aprovada**, **escalada ao humano**.
- Aprovação congela a tela: não reabrir por preferência estética. Uma funcionalidade nova permite revisar apenas sua área e possíveis regressões; não reinicia uma revisão geral da tela.
- Ao chegar ao sexto round com divergência visual, mostrar evidências e pontos restantes ao humano, sem criar automaticamente outra rodada. Falhas objetivas de segurança, integridade de dados, navegação ou acessibilidade devem ser descritas separadamente e corrigidas, não mascaradas como gosto visual.
- O designer é o único operador do navegador. O Lead registra e controla os rounds, coordena escopos e guarda commits locais. Atualização de 9/10/2026: o humano autorizou deploy de todos os pendentes antes de implementar pausa. Lead executou release separado sem pausa; designer não executou deploy.

## Estado atual — encerramento finito em 9/10/2026

B index-Dh5V5Fhr.js, C index-Bmf_Lz1l.js, D index-BTkKlKSR.js revisados conforme [evidências](visual-checklist.md). E1 index-C_AShFyv.js reprovou apenas largura das colunas no projeto. E2 index-BohQojQt.js corrigiu e foi capturado/aberto/aprovado1440/390; identidade do bundle confirmada no browser. Sem pendência visual bloqueante nos estados inspecionados.

Lead informou deploy autorizado concluído:13functions4d42a63, Hosting9e64b8d/BohQojQt e Rules, smoke remoto read-only PASS. Designer verificou apenas login público pós-deploy em duas viewports, sem autenticar. Fixture local privada2docs removida pelo backend após D/E DONE; restantes preservadas.

## Matriz de cobertura atual

| Rota/estado                  | Rounds/lotes efetivamente inspecionados | Estado atual                         | Limite / próximo escopo                                                             |
| ---------------------------- | --------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| /app dashboard               | A, B, C, E1                             | Aprovada                             | Sem reabrir estética. Nova área tópicos1440/390 e reload vistos.                    |
| /me relatório                | B, E1 tópicos                           | Aprovada; base congelada pelo humano | Colega3,5h/tópico1,75h; não é prova de todo cache transitório.                      |
| /projects lista              | B, D                                    | Aprovada                             | Personalempty/owner/colleague, scopeURL/reload.                                     |
| /projects/:id overview       | B, C, E1, E2                            | Aprovada após E2                     | Regressão2colunas E1 corrigida, E2 ambas viewports vistos.                          |
| /projects/:id editar/arquivo | C, E1                                   | Aprovada                             | Header/acessoimutável, inlineform e confirmação; nenhum submit.                     |
| /records lista               | B                                       | Aprovada                             | Estados vazios/erro completos não auditados.                                        |
| /records/:id página          | B                                       | Aprovada                             | Três abas; não todos caminhos de entrada.                                           |
| Drawer registro/histórico    | A, B, C, D                              | Aprovada nos estados vistos          | D é primeira prova do histórico realmente revelado. C filenames revelado eram safe. |
| /pending lista/editor        | A editor, B, C editor                   | Aprovada                             | Footer móvel livre do banner em C; não encerrou fatos reais.                        |
| /rules                       | B                                       | Aprovada                             | Texto longo mobile; invariantes são validação backend separada.                     |
| /calendar mês/semana         | B, C semana                             | Aprovada/congelada humano            | Geometria e tipografia preservadas. Nem todos estados contextuais.                  |
| Login SPA / OAuth            | B; produção P login SPA                 | Aprovada visualmente                 | Sem Googleconsent. P apenas público não autenticado1440/390.                        |
| Dark                         | A, C                                    | Aprovada em C                        | Amostra1280; não todas rotas no temaescuro.                                         |
| Loading/network/404/retry    | Coleta parcial                          | Não exaustivamente revisada          | Não afirmar cobertura total.                                                        |

Nenhum estado ultrapassou6rounds; baseline não conta. Desktop/mobile do mesmo lote são o mesmo round. D/E funções novas não reabrem geometria congelada.

## Histórico anterior (não é o estado atual)

Os registros a seguir preservam decisões e limitações do momento da coleta. Menções a pendências/aguardas históricas não anulam a matriz atual.

## Árvore completa das rotas de interface

```text
/                                      Login SPA (returnTo preserva destino)
/app                                   Dashboard global
/me                                    Meu relatório
/calendar                              Calendário pessoal
  ?view=day|week|month                  Dia / semana / mês
  &density=supercompact|compact|timeline Supercompacto / compacto / régua
  &date=YYYY-MM-DD                      Data âncora
/projects                              Lista de projetos
/projects/:projectId                   Detalhe do projeto
  ?tab=overview                        Visão geral (em implementação C)
  ?tab=details                         Detalhes / Editar (em implementação C)
/records                               Meus registros
/records/:recordId                     Registro individual
/pending                               Pendências
/rules                                 Regras de negócio
/login?flow=…                          Login / consentimento OAuth separado
*                                      Página não encontrada
```

Estados contextuais não são novos paths: `?record=ID` abre registro sobre a rota de origem; `&recordTab=details|edit|history` deve representar as abas (implementação C). `/records/:recordId` usa o mesmo controle `recordTab`. `/app`, `/me`, `/calendar`, `/pending` e listas podem abrir o drawer preservando período/filtros. Cada combinação de parâmetros tem URL independente sem duplicar páginas no Router. Filtros de relatórios incluem `fromDate`, `toDate`, `projectId` e `includeArchived`; listas também têm filtros próprios (`project`, `status`, `after`).

Na entrega B, tópico→pessoas ainda era futuro. E implementou seleção qualificada projectId/topicId no parâmetro topic e foi validada em reload/back/forward, sem criar nova subrota.

## Registro dos rounds

### A — dashboard, drawer e editor de pendências (round 1)

Build: `index-BNQH_IsO.js`. Evidências desktop/mobile abertas pelo designer estão no [checklist visual](docs/design/visual-checklist.md).

- Dashboard: toolbar ainda arredondada demais e grid mobile assimétrico; e-mail duplicado e navegação sem hierarquia. Correções agrupadas na fase B; verificação pós-correção ainda pendente.
- Drawer: Detalhes default e tabs reais corrigiram vazio inicial. Restam verificação de foco e abas na URL (pedido funcional posterior).
- Editor de pendência: formulário ficou legível, porém Salvar mobile estava sob o banner Firebase. B reservou o inset sem esconder o aviso; confirmar visualmente.
- Decisão: não aprovar globalmente sem revisar as correções.

### Feedback humano após B — decisões vinculantes

- Meu relatório está lindo: congelar composição geral.
- Calendário: tipo de visualização e geometria estão perfeitos; não redesenhar. Header/filtros precisa contextualização pelo design system.
- Projeto: Detalhes ainda tem botão Gerenciar projeto perdido; corrigir o fluxo, não repetir simples mudança de paleta.
- Todas as abas/subseleções devem ter URL independente, sobreviver a reload e responder a voltar/avançar; incluindo drawers/modais de pendências e registros.

## C — correções direcionadas verificadas

Build C `/assets/index-Bmf_Lz1l.js` servido após declaração explícita do frontend e confirmação HTTP do Lead.

- Dashboard 1440/390: donut usa cores reais de tema. Designer abriu as duas evidências; **aprovado/congelado** para esta correção.
- Projeto overview 1440/390: avisos reunidos em Notas de cálculo recolhidas, sem mascarar cálculo. Evidências abertas; **aprovado/congelado** nesta área.
- Calendário semana header 1440/390: contexto/coerência do header corrigidos, geometria e tipografia originais intocadas. Evidências abertas; **aprovado/congelado**.
- Editor de pendência 390: Salvar acessível acima do banner; tabs details/history na URL e reload preservando details. Evidência aberta; **P0 resolvido/aprovado**.
- C finito liberado pelo designer com 15 capturas abertas: gestão inline e archive confirm 1440/390 **aprovados**, sem submit. Abas projectTab/recordTab com reload confirmadas. Histórico seguro aprovado; arquivos chamados history-revealed continuaram ocultos após reload e **não são evidência do estado revelado**. Dark aguarda veredito final; histórico populado/loading/empty/error transferidos para D sem aprovação presumida.

## D — privacidade publicada localmente

- Frontend declarou escopo terminado/pronto para revisão; designer concluiu C e liberou runtime. Build D `/assets/index-BTkKlKSR.js` e CSS `/assets/index-DLFhqUPL.css` servidos HTTP200 em `http://127.0.0.1:5000`, sem servidor substituto ou restart.
- Backend recompilado e lib copiada no container existente; rules recarregadas com log **Rules updated**, 13 functions carregadas incluindo listProjects/createProject/mergeTopics. Checksums de rules, backend entry e frontend HTML idênticos host/container. Callable listProjects sem token retorna UNAUTHENTICATED.
- Designer iniciou rodada funcional D: escopo obrigatório de criação, tabs personal/work com URL/reload, regressões e estados pendentes de C. Sem retoques em composições aprovadas.
- Prova integrada 2UID local concluída: PASS31/exit0, 12 documentos exclusivos e usuários temporários removidos em finally; evidência em docs/security/project-privacy-integration.md. Não prova OAuth/signatura de produção. Fixture UI separado 2docs novos para designer, sem tocar histórico existente.

## Modelo para cada próxima revisão

`Rota/estado | round N/6 | build | viewport/evidência aberta | achados objetivos | alterações pedidas | aprovados/congelados | decisão e responsável`

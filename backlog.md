# Backlog

## Entregas concluídas

- [x] Gerenciamento de projetos: editar título/descrição, categoria pessoal/trabalho e URL GitHub HTTPS validada. Publicado na entrega 3.
- [x] Mesclagem de projetos: preview, confirmação, migração auditável e retomável de registros/tópicos e arquivamento da origem. Cancelamento libera locks sem rollback de lotes.
- [x] Confidencialidade visual: projeto marcado confidencial e modo live com olho fechado por padrão, ocultando nomes e contextos até revelação explícita. Não altera acesso autorizado aos dados.

## Próximas entregas planejadas

- [ ] Arquivar/desarquivar projetos e listar arquivados. Ocultar nos relatórios/calendário por padrão sem apagar registros; distinguir arquivamento manual de origem mesclada. Definir efeito no orçamento global sem fabricar saldo. Arquivar não melhora custo sozinho sem queries/indexação.

- [x] Dashboard pessoal: distribuição de tempo por projeto em dia, semana e mês, via relatório calculado e paginação explícita.
- [x] Calendário pessoal semanal/mensal com atividades coloridas, sobreposições e estimativas identificadas. Visualização responsiva por dia, sem drag-and-drop.
- [ ] Refinar reconciliação e limites de relatórios para considerar o contexto completo entre projetos/páginas.
- [ ] Testes completos das regras no Firebase Emulator e execução real do Docker Compose, além da validação estática atual.
- [ ] Refinamento visual e redução do bundle frontend; ícones consistentes nas ações de detalhe/auditoria.
- [ ] Edição de início e revisão da política de histórico: horários/projeto precisam histórico; mudança só de tópico não precisa histórico segundo solicitação de Victor. Implementação atual registra todas alterações.

## Performance — evolução futura, não iniciar nesta rodada

- [ ] Medir latência, leituras e custo dos relatórios com volume representativo.
- [ ] Indexar intervalos com timestamps normalizados por pessoa/período, incluindo fatos que atravessam dias.
- [ ] Consolidar dias/meses encerrados sem apagar registros originais nem evidências.
- [ ] Invalidar/recalcular somente períodos afetados por edição, merge ou registro retroativo; versionar políticas.
- [ ] Avaliar cache/materialização e processamento incremental com garantias de consistência do orçamento global.

## Futuro — não implementar agora

### Convite de pessoas externas

- Registrar e-mails específicos autorizados como exceção à restrição @wads.dev.
- Oferecer fluxo de entrada como externo na interface, usando Firebase Auth.
- Validar identidade e e-mail verificado na lista de convidados autorizados; digitar um e-mail não concede acesso.
- Aplicar a mesma decisão de acesso no MCP, nas Functions e no Firestore; não apenas no frontend.
- Na primeira versão, convidados participam dos projetos compartilhados da instância, sem permissões granulares por projeto.
- Posteriormente, adicionar permissões por projeto para externos, revogação e gestão de convites.

Esta feature fica apenas registrada no backlog. Não alterar o acesso atual, convidar pessoas ou iniciar sua implementação agora.

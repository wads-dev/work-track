# Backlog

## Em implementação

- [ ] Gerenciamento de projetos: editar título/descrição, categoria pessoal/trabalho e URL GitHub HTTPS validada.
- [ ] Mesclagem de projetos: preview, confirmação, migração auditável e retomável de registros/tópicos e arquivamento da origem.
- [ ] Confidencialidade visual: projeto marcado confidencial e modo live com olho fechado por padrão, ocultando nomes e contextos até revelação explícita.

## Próximas entregas planejadas

- [ ] Dashboard pessoal: distribuição de tempo por projeto em dia, semana e mês.
- [ ] Calendário pessoal semanal/mensal com atividades coloridas, sobreposições e estimativas identificadas.
- [ ] Refinar reconciliação e limites de relatórios para considerar o contexto completo entre projetos/páginas.
- [ ] Testes completos das regras no Firebase Emulator e execução real do Docker Compose, além da validação estática atual.
- [ ] Refinamento visual e redução do bundle frontend; ícones consistentes nas ações de detalhe/auditoria.
- [ ] Edição de início e revisão da política de histórico: horários/projeto precisam histórico; mudança só de tópico não precisa histórico segundo solicitação de Victor. Implementação atual registra todas alterações.

## Futuro — não implementar agora

### Convite de pessoas externas

- Registrar e-mails específicos autorizados como exceção à restrição @wads.dev.
- Oferecer fluxo de entrada como externo na interface, usando Firebase Auth.
- Validar identidade e e-mail verificado na lista de convidados autorizados; digitar um e-mail não concede acesso.
- Aplicar a mesma decisão de acesso no MCP, nas Functions e no Firestore; não apenas no frontend.
- Na primeira versão, convidados participam dos projetos compartilhados da instância, sem permissões granulares por projeto.
- Posteriormente, adicionar permissões por projeto para externos, revogação e gestão de convites.

Esta feature fica apenas registrada no backlog. Não alterar o acesso atual, convidar pessoas ou iniciar sua implementação agora.

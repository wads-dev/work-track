# Entregas incrementais

1. Projetos: menu lateral, lista, detalhe e gráficos pessoa/tópico via callable. Publicado b2ac72d; política parcial/estimativas em report-policy.md.
2. Conciliação: edição auditável do fim, painel direito e aviso MCP de abertos. Publicado na entrega 2. Dono edita via callable/MCP; write direto Firestore permanece negado para não contornar auditoria. Leitura corporativa de registros é solicitada pelo usuário e deve ser explícita na regra.
3. Gerenciamento: título/descrição/tipo/GitHub HTTPS e mesclagem com preview, confirmação, migração auditável e soft archive. Publicado na entrega 3. Não executar merge real sem confirmar origem/destino.
4. Dashboard pessoal: filtros URL e calendário semana/mês com distribuição por projetos e sobreposições sinalizadas. Implementado e validado na entrega 4. Regras, pendências e ícones publicados separadamente.

CI e deploy são responsabilidade do Lead; três workflows com paths no gatilho mantêm históricos independentes. Preferências visuais: Material UI como base, dark mode do sistema e toggle, camadas leves/vidro discreto, densidade mais compacta, movimento fluido respeitando reduced-motion.

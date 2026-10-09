# Gerenciamento de projetos e modo live

Metadados incluem título, descrição, categoria pessoal/trabalho, URL GitHub HTTPS validada e marca confidencial. Projetos conhecidos sem marca são públicos por padrão, compatível com documentos antigos. Enquanto metadados do projeto não carregaram, a interface oculta os textos até conhecê-los.

Modo live inicia fechado em cada sessão. Abrir o olho só revela na memória; não modifica permissões ou impede acesso via SDK por usuário corporativo autorizado. Nomes, contextos, textos e histórico potencialmente sensível não devem ser renderizados quando ocultos.

## Arquivar e desarquivar

Arquivamento manual preserva projetos, registros e evidências. Projetos ativos são padrão; a listagem permite ativos/arquivados/todos. Relatórios e calendário excluem arquivados por padrão e permitem inclusão explícita do histórico.

A exclusão visual não reinicia orçamento global: fatos e estimativas arquivados continuam no contexto do dia. Essa versão não promete otimização completa de leitura dos registros; indexação/materialização permanece backlog. Origem mesclada não pode ser desarquivada genericamente, e projetos com merge em andamento não podem ser alterados.

## Mesclagem

1. Selecionar origem e destino explicitamente.
2. Consultar preview: contagem agregada real, mapeamento de tópicos e avisos; sem mutations.
3. Confirmar motivo e iniciar com requestId. Cada chamada migra até 100 registros; repetir mesma intenção para retomar.
4. Durante execução, origem e destino ficam bloqueados para writes da aplicação. Ao concluir, origem é arquivada e aponta para destino. Não há exclusão de documentos/evidências.
5. Confidencialidade da origem propaga ao destino.
6. Se houver impedimento, cancelamento explícito libera locks e mantém logs e lotes já migrados. **Cancelamento não é rollback**. Não retomar job cancelado; uma nova tentativa exige nova intenção e revisão do estado atual.

Auditoria de migração preserva originalText, recordedAt, fingerprint e requestId de criação. Admin manual no console não participa desses locks: evitar editar os mesmos dados durante execução.

Nenhuma mesclagem real será executada pelo Lead sem confirmação humana de origem e destino. Victor já migrou manualmente o caso inicial.

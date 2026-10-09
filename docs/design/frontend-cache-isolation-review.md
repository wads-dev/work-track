# Cache, coerência e autorização dos relatórios

Nota delimitada — 2026-10-09. Sem afirmação de deploy ou check integral final.

## Comportamento esperado

Os cálculos compartilham os casos de uso existentes do backend; os repositórios frontend recebem registros canônicos autorizados pelo projeto atual. Projetos públicos/work podem compartilhar seus registros entre usuários autenticados; projetos pessoais permanecem restritos ao proprietário. Não há necessidade de projeções ou reescrita do domínio para esta política.

O catálogo tipado é realtime. listProjects backend serve somente ao catálogo de projetos legados sem tipo explícito. O documento pai atual continua sendo autoridade: mudanças de proprietário/tipo, remoção do pai ou erro de permissão precisam invalidar a fonte e os resultados retidos. Uma resposta de catálogo antiga não conserva uma concessão de acesso.

Snapshots imutáveis, identidade do repositório e fences de usuário/consulta/revisão evitam renderizar um cálculo com uma fonte diferente. Coerência de branches inclui versões e membership, não uma transação atômica entre listeners. Cache-only, escritas pendentes ou branches ainda incoerentes são provisórios, não confirmação do servidor. Disposição cancela listeners e remove dados retidos da fonte.

## Persistência e limites

Firestore usa cache em memória. Auth utiliza persistência local do navegador; isso não significa cache persistente de registros em IndexedDB. Não há garantia documentada de limpeza de IndexedDB ou funcionamento offline com permissões atuais.

A seleção temporal do calendário é indexada e usa margem de dois dias, mas o contexto autorizado ainda transfere histórico completo. Cache e sincronização não comprovam transferência mínima, latência ou custo. Não foram estabelecidas métricas autenticadas em produção.

## Checkpoints de validação

194 testes frontend foram reportados aprovados antes da alteração final 526; 35 testes focados e 10 testes finais de Rules na base 7cc03b também foram reportados. A transição ativa 384 ainda não tinha resultado de testes registrado nesta nota. Esses checkpoints não são aprovação integral do estado final, prova de persistência/limpeza no navegador ou publicação.

Veja [arquitetura](frontend-report-repositories.md) e [evidência temporal](calendar-bounded-parity-evidence.md).

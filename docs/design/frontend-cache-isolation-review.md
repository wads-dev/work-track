# Cache, coerência e autorização dos relatórios

Nota delimitada — 2026-10-09. Sem afirmação de deploy ou check integral final.

## Comportamento esperado

Os cálculos compartilham os casos de uso existentes do backend; os repositórios frontend recebem registros canônicos autorizados pelo projeto atual. Projetos públicos/work podem compartilhar seus registros entre usuários autenticados; projetos pessoais permanecem restritos ao proprietário. Não há necessidade de projeções ou reescrita do domínio para esta política.

O catálogo de projetos Web é realtime: consultas `type == work` e `type == personal && createdBy == uid` têm assinaturas locais (`source: cache`) e de sincronização (`source: default`). Documentos de projetos não são mais obtidos/cacheados pela Callable listProjects. O catálogo assume o contrato atual de criação com type obrigatório; não inclui documentos sem type nem adiciona fallback para eles. Listeners e metadados são descartados ao desmontar/trocar conta. Mudanças de proprietário/tipo, remoção ou erro invalidam resultados. Antes de expor metadados de sessões anteriores, ambas as consultas precisam confirmar acesso no servidor nesta assinatura; IndexedDB não é autorização permanente.

Snapshots imutáveis, identidade do repositório e fences de usuário/consulta/revisão evitam renderizar um cálculo com uma fonte diferente. Coerência de branches inclui versões e membership, não uma transação atômica entre listeners. Cache-only, escritas pendentes ou branches ainda incoerentes são provisórios, não confirmação do servidor. Disposição cancela listeners e remove dados retidos da fonte.

## Persistência e limites

Firestore usa `persistentLocalCache` em IndexedDB com `persistentMultipleTabManager`. Auth continua com persistência local independente. Cache em disco pode sobreviver ao logout; logout não apaga IndexedDB e o recurso só deve ser usado em dispositivo confiável. A primeira leitura de projetos após iniciar uma assinatura exige confirmação de acesso remota: não há garantia de login/navegação inicial offline, nem confirmação de totais a partir de cache parcial. Após confirmar acesso, eventos locais e remotos carregam indicadores `fromCache`/`hasPendingWrites`; pendências não apresentam cache vazio como “Tudo em dia”. O diretório de pessoas mantém seu provider em memória e a consulta backend existentes.

A seleção temporal do calendário é indexada e usa margem de dois dias, mas o contexto autorizado ainda transfere histórico completo. Cache e sincronização não comprovam transferência mínima, latência ou custo. Não foram estabelecidas métricas autenticadas em produção.

## Checkpoints de validação

194 testes frontend foram reportados aprovados antes da alteração final 526; 35 testes focados e 10 testes finais de Rules na base 7cc03b também foram reportados. A transição ativa 384 ainda não tinha resultado de testes registrado nesta nota. Esses checkpoints não são aprovação integral do estado final, prova de persistência/limpeza no navegador ou publicação.

Veja [arquitetura](frontend-report-repositories.md) e [evidência temporal](calendar-bounded-parity-evidence.md).

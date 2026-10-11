# Repositories de relatórios no frontend

Atualização de escopo: 2026-10-09. Esta nota descreve código em desenvolvimento, não comprova publicação.

## Arquitetura

O frontend reutiliza os casos de uso e cálculos existentes de relatórios pessoal, corporativo, calendário e projeto. A mudança é na infraestrutura do repositório: Firebase Web SDK, snapshots imutáveis e subscriptions. Não exige projeções nem reescrita do domínio backend.

A autorização segue o projeto atual: projetos work/públicos são acessíveis a usuários autenticados; projetos pessoais somente ao proprietário. Registros de um projeto autorizado podem ser lidos independentemente do autor. O projectId não substitui a verificação do documento pai pelas Rules. Escritas seguem a autorização do projeto e as validações de identidade/dados.

O catálogo Web usa a fonte de projetos work e pessoais do proprietário, com leitura local e listeners de sincronização Firestore. O catálogo/paginação Callable deixou de ser consumido pelo frontend; comandos e diretório de usuários continuam no backend. Apenas o contrato atual de projetos com type explícito integra esta lista; não foi acrescido fallback para documentos sem type. IndexedDB persiste documentos consultados, mas autorização atual é confirmada por assinatura antes de exibir dados de sessões anteriores. A fonte de registros próprios abre e fecha suas consultas por projectId a partir desse mesmo catálogo reativo; mudanças de escopo e remoção são refletidas sem refresh manual.

A fonte autorizada consulta registros canônicos por projectId e mantém contexto de orçamento separado da seleção visível. A fonte pessoal mantém contexto do proprietário. Revogação, erros e troca de usuário invalidam fontes/resultados; branches incoerentes não devem produzir novos totais confirmados.

## Calendário e limites

A seleção do calendário aplica projectId e limites temporais no Firestore antes da transferência. Duas branches startedAt/endedAt preservam registros abertos e intervalos que atravessam datas. A margem lexical é de dois dias em cada extremidade; o caso de uso faz o recorte exato.

Isso não torna toda a leitura mínima: a fonte autorizada ainda baixa histórico completo dos projetos acessíveis para o contexto dos orçamentos diários. Não há comprovação de redução global de documentos, latência ou custo. Limites operacionais dos casos de uso não são limites de transferência Firestore.

## Evidência disponível

Foram reportados 194 testes frontend aprovados antes da alteração final 526, 35 testes focados e 10 testes finais de Rules na base de hash 7cc03b. São checkpoints históricos delimitados, não validação integral do lote atual. A transição ativa 384 ainda aguardava testes ao escrever esta nota. Nenhum desses resultados comprova deploy ou métricas de calendário autenticado.

Veja [cache e isolamento](frontend-cache-isolation-review.md) e [limites da evidência temporal](calendar-bounded-parity-evidence.md).

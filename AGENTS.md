# Instruções para agentes — Work Track

## Confidencialidade: somente projetos

- **Projeto pode ser confidencial; pessoa não é confidencial.** O modo de ocultar dados confidenciais mascara o conteúdo dos projetos marcados como confidenciais e os dados de tópicos/registros vinculados a eles, nunca o diretório de pessoas ou a identidade das pessoas (nome, e-mail, ID e foto).
- A tela Pessoas, sua busca, contagem e estados de carregamento/erro/vazio devem continuar disponíveis em ambos os modos. Não condicione identidade ou diretório a `PrivacyContext`/`revealed`.
- Confidencialidade é apresentação, não autorização: mantenha autenticação corporativa, isolamento de contas e ACLs de projetos/registros. Mostrar uma pessoa não concede acesso às suas atividades.

## Arquitetura obrigatória: filtros na base de dados

- Views, viewmodels, controllers e hooks não selecionam/filtram datasets. Recebem dados prontos e passam parâmetros de seleção para a camada de repository. Não aplicar filtro de negócio de listagem/período/pessoa/projeto/tópico/estado nessas camadas.
- Repositories traduzem parâmetros em consultas na base de dados. Não substituir consultas suportadas por loops, filter, flatMap, find ou seleção manual em arrays. No Web, consultas de tela usam o cache persistente do Firestore, com índices locais, separadas dos listeners globais de sincronização; filtros de tela nunca criam novos listeners remotos.
- Única exceção: predicado que a base Firebase realmente não suporta. Aplicar todos os predicados suportados na consulta, manter o residual dentro do repository e documentar a limitação concreta (sem exceções genéricas ou apenas de conveniência).
- Distinguir seleção de datasets de validação de schema/ACL, transformação, ordenação de apresentação e cálculos de domínio (intervalos, sobreposições, agregação). Segurança/validações não podem ser removidas para satisfazer regra superficialmente.
- Consultas de intervalo devem cobrir registros que atravessam o período inteiro e registros abertos; não usar somente início/fim dentro do intervalo. Não retornar totais parciais silenciosamente. Não ampliar ACLs, gerar leituras remotas por navegação ou desativar índices locais.

## Isolamento obrigatório

- Correções de bugs e features devem ser feitas em uma **Git worktree separada**, com branch própria baseada no estado relevante de origin/main. Nunca misture alterações pendentes do checkout principal.
- Antes de editar, confirme pwd, git status, branch, arquivos de instrução e estado do PR. Preserve alterações alheias. Não faça reset/clean ou descarte trabalho sem autorização.
- Abra um PR e entregue o link. Se o PR anterior já foi mesclado, abra um novo PR; não é possível acrescentar commits a um PR mesclado.

## Ambiente de validação obrigatório

Antes da validação visual, suba Docker **a partir da worktree**, usando projeto Compose exclusivo, volumes próprios e portas livres para frontend e todos os emuladores. Nunca reutilize o projeto Compose do checkout principal nem pare os containers de outra pessoa.

Informe ao usuário antes: “Vou validar esta worktree em http://localhost:PORTA com Docker e hot reload do Vite; os emuladores estarão isolados nas portas …”. Use essa mesma URL no Navigator/Playwright e disponibilize-a para validação humana.

### Como escolher projeto e portas

1. Liste os projetos existentes com `docker compose ls` e containers/portas com `docker ps --format 'table {{.Names}}\t{{.Ports}}'`. Identifique ambientes de outras worktrees e não os reutilize.
2. Verifique também listeners do host (por exemplo `lsof -nP -iTCP -sTCP:LISTEN`): uma porta livre no Docker pode estar ocupada por outro processo.
3. Escolha um COMPOSE_PROJECT_NAME exclusivo e um conjunto completo de portas livres: frontend, Auth, Firestore, Functions e Emulator UI. Os números abaixo são apenas exemplos, nunca uma reserva fixa ou um padrão automático.
4. Registre as escolhas somente no .env.worktree ignorado. Confirme com `docker compose --env-file .env.worktree config` que o projeto e mapeamentos são os esperados. Se houver conflito, escolha outro conjunto; nunca pare outro serviço para liberar a porta.
5. Informe ao usuário a URL e todas as portas antes das validações. Depois de subir, confirme em ps os mapeamentos e teste a URL pelo navegador.

Crie localmente .env.worktree (ignorado por .gitignore). Exemplo — escolha portas realmente livres:

template:

COMPOSE_PROJECT_NAME=worktrack-minha-branch
FRONTEND_PORT=5174
FIREBASE_AUTH_PORT=9100
FIREBASE_FIRESTORE_PORT=8082
FIREBASE_FUNCTIONS_PORT=5002
FIREBASE_UI_PORT=4002

Execute:

docker compose --env-file .env.worktree up --pull always --build -d

docker compose --env-file .env.worktree ps

docker compose --env-file .env.worktree logs --tail 80

As portas escolhidas, arquivos .env, overrides locais, dumps e credenciais **não entram no commit**. É permitido commitar suporte genérico a portas parametrizadas, sem trocar os defaults do ambiente principal. O bootstrap demo deve encaminhar o navegador para as mesmas portas publicadas; não basta alterar o mapeamento Docker.

Frontend: bind mount da própria worktree e Vite com polling/HMR. Verifique logs “ready”, HTTP da página, configuração /__/firebase/init.json, módulos JS, conexão HMR e comportamento real no navegador. HTTP 200 do HTML sozinho não prova funcionamento: confira console e imports virtuais (inclusive PWA).

Emuladores: espere “All emulators ready” e valide Auth, Firestore e Functions. Use somente demo-work-track e dados sintéticos; nunca credenciais/dados de produção. O frontend tem hot reload; o script atual copia e compila backend somente na inicialização, portanto **não prometa hot reload de Functions**. Após alterar backend/Rules/fixtures, recrie somente o serviço firebase deste projeto e aguarde prontidão:

docker compose --env-file .env.worktree up --build -d --force-recreate firebase

### Encerramento: somente com autorização humana

Mantenha o ambiente disponível enquanto o usuário valida, inclusive depois dos seus testes e da abertura do PR. **Nunca derrube automaticamente os containers ao terminar a tarefa.** Informe limitações e dados demo versus produção.

Só depois de o usuário dizer explicitamente que pode encerrar, confirme o nome exato do projeto e execute `docker compose --env-file .env.worktree down` a partir da mesma worktree, para parar e remover somente os containers/rede deste ambiente. Confira novamente `docker compose ls` e `docker ps` para garantir que os outros projetos continuam intactos. Não use `down -v`, prune ou exclusão de dados sem autorização separada; preserve os volumes por padrão.

## Validação e entrega

- Execute npm run check (Prettier, ESLint, TypeScript, testes e builds) e git diff --check.
- Adicione regressões para a correção, preserve autenticação/privacidade e orçamentos de leitura. Não retorne totais parciais silenciosos.
- Revise o diff final, garanta que somente alterações intencionais são staged e que configurações/portas locais não foram incluídas.
- Na entrega informe URL local, PR, resultado dos testes e o que foi realmente verificado no navegador. Nunca diga que fez deploy, HMR ou teste visual sem evidência.

# Deploy automático

GitHub Actions valida formatação, lint, tipos, testes e build. Somente pushes na main executam deploy; pull requests apenas validam. Workflows separados publicam backend, frontend e Firestore com filtro paths no gatilho e histórico independente. Configuração global pode disparar mais de um workflow. CI geral permanece separado.

A autenticação usa GitHub OIDC e Workload Identity Federation do Google Cloud, sem chave de serviço. O provider aceita apenas repository_id 1411074260, repository_owner_id 299704183, ref refs/heads/main e evento push. A conta dedicada é github-deploy@wadsworktrack.iam.gserviceaccount.com.

Auth providers não são alterados pela esteira. Deploys são serializados para evitar versões concorrentes. Roles de deploy incluem administração de Functions, Hosting, regras, índices e Artifact Registry; não foi concedido Editor ou Owner. A conta pode atuar como a conta runtime Compute específica.

O código autoral permanece em apps/backend; o upload Firebase usa o artefato standalone gerado em apps/backend/dist/functions. O build compila core, data e módulos backend e prepara um bundle com código local embutido e terceiros externos. O manifesto runtime e seu lock são projetados do lock raiz, sem links/workspaces, sem pacotes @work-track no registry e sem modificar o manifesto da aplicação. O predeploy repete a preparação de modo idempotente. Hosting permanece em apps/frontend/dist; federação/OIDC não muda.

Os testes de packaging instalam o artefato em diretório temporário fora do monorepo e verificam import e descoberta de metadados pelo runtime oficial Firebase Functions, com configuração demo e sem deploy. O build modular lib permanece disponível para probes e testes locais. Dependências core/data e scripts de packaging disparam os workflows relevantes de backend/frontend.

Desenvolvimento Vite resolve os sources compartilhados por condição development, sem prebundle dos pacotes locais; build de produção resolve os JS compilados. As declarações dos pacotes são compiladas antes de typecheck/test/build dos consumidores. Não use imports diretos entre apps ou para packages/src.

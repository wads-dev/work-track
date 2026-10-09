# Deploy automático

GitHub Actions valida formatação, lint, tipos, testes e build. Somente pushes na main executam deploy; pull requests apenas validam. Jobs separados publicam backend, frontend e Firestore conforme paths alterados; configuração global pode disparar mais de um alvo.

A autenticação usa GitHub OIDC e Workload Identity Federation do Google Cloud, sem chave de serviço. O provider aceita apenas repository_id 1411074260, repository_owner_id 299704183, ref refs/heads/main e evento push. A conta dedicada é github-deploy@wadsworktrack.iam.gserviceaccount.com.

Auth providers não são alterados pela esteira. Deploys são serializados para evitar versões concorrentes. Roles de deploy incluem administração de Functions, Hosting, regras, índices e Artifact Registry; não foi concedido Editor ou Owner. A conta pode atuar como a conta runtime Compute específica.

Monorepo preserva npm run check na raiz, source apps/backend e public apps/frontend/dist, sem alterar federação.

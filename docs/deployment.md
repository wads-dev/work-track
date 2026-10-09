# Deploy automático

GitHub Actions valida formatação, lint, tipos, testes e build. Somente pushes na main executam deploy de Functions, Hosting e Firestore; pull requests apenas validam.

A autenticação usa GitHub OIDC e Workload Identity Federation do Google Cloud, sem chave de serviço. O provider aceita apenas repository_id 1411074260, repository_owner_id 299704183, ref refs/heads/main e evento push. A conta dedicada é github-deploy@wadsworktrack.iam.gserviceaccount.com.

Auth providers não são alterados pela esteira. Deploys são serializados para evitar versões concorrentes. Roles de deploy incluem administração de Functions, Hosting, regras, índices e Artifact Registry; não foi concedido Editor ou Owner. A conta pode atuar como a conta runtime Compute específica.

A reorganização monorepo deve preservar npm run check na raiz e atualizar source/public no firebase.json, sem alterar a federação.

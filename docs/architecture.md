# Arquitetura

Monorepo npm: apps/backend contém Express/MCP e apps/frontend contém React/Vite. Firebase, regras, índices e CI ficam na raiz. Login OAuth estático é preservado no public do frontend e copiado para dist pelo Vite. Membros trabalham em aplicações separadas; manifests, lockfiles e configuração global são coordenados pelo Líder de Projetos.

DDD pragmático, com um único contexto de registro. Projetos e tópicos são entidades desse contexto, não módulos separados.

- `apps/backend/src/core/auth`: autenticação OAuth, contratos e adaptadores Firebase.
- `apps/backend/src/core/http`: composição HTTP e transporte MCP.
- `apps/backend/src/modules/registration/domain`: entidades, contratos de repositório, validação e política de busca. Zod permanece como validador de domínio nesta versão.
- `apps/backend/src/modules/registration/application`: casos de uso, validação de entrada e orquestração.
- `apps/backend/src/modules/registration/infrastructure`: persistência Firestore e transações.
- `apps/backend/src/modules/registration/presentation`: adaptador das ferramentas MCP.
- `apps/backend/src/shared`: utilitários neutros, sem dependência de core ou módulos.
- `apps/backend/src/index.ts`: composition root e exports exigidos pelo Firebase.

Dependências fluem para dentro: apresentação usa aplicação; aplicação usa domínio e contratos; infraestrutura implementa os contratos. Domínio não conhece Firebase, Express ou MCP. O módulo reports tem um bootstrap interno para consulta por projeto via collectionGroup, sem API pública nem cálculos de relatório.

Os nomes, schemas e URLs MCP/OAuth, as coleções Firestore e os registros existentes são preservados. Testes ficam próximos das implementações.

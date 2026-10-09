# Arquitetura

DDD pragmático, com um único contexto de registro. Projetos e tópicos são entidades desse contexto, não módulos separados.

- `src/core/auth`: autenticação OAuth, contratos e adaptadores Firebase.
- `src/core/http`: composição HTTP e transporte MCP.
- `src/modules/registration/domain`: entidades, contratos de repositório, validação e política de busca. Zod permanece como validador de domínio nesta versão.
- `src/modules/registration/application`: casos de uso, validação de entrada e orquestração.
- `src/modules/registration/infrastructure`: persistência Firestore e transações.
- `src/modules/registration/presentation`: adaptador das ferramentas MCP.
- `src/shared`: utilitários neutros, sem dependência de core ou módulos.
- `src/index.ts`: composition root e exports exigidos pelo Firebase.

Dependências fluem para dentro: apresentação usa aplicação; aplicação usa domínio e contratos; infraestrutura implementa os contratos. Domínio não conhece Firebase, Express ou MCP. Não há módulo vazio de relatórios.

Os nomes, schemas e URLs MCP/OAuth, as coleções Firestore e os registros existentes são preservados. Testes ficam próximos das implementações.

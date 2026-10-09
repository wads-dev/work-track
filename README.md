# Wads Ponto

Base TypeScript de um servidor MCP para registrar início e fim de trabalho por usuário e projeto, usando Firebase Functions, Firebase Auth e Firestore. O nome é provisório.

## Pré-requisitos

- Node.js 22 e npm (use `nvm use`).
- Projeto Firebase para executar emuladores e publicar; produção com Functions exige plano Blaze.
- Java compatível com a versão do Firebase CLI para o emulador Firestore.

## Desenvolvimento

`npm ci` instala as dependências e configura o hook Git.

- `npm run check`: formatação, lint, tipos, testes e build.
- `npm run format`: formata os arquivos com Prettier.
- `npm run lint:fix`: corrige problemas de lint automaticamente.
- `npm run test:watch`: testes em modo watch.

ESLint faz análise TypeScript com informações de tipos. TypeScript usa modo estrito. Husky e lint-staged verificam os arquivos preparados para commit. A integração contínua executa a mesma validação completa em pushes e pull requests.

## Firebase

1. Autentique o CLI com `npx firebase-tools login`.
2. Associe seu projeto com `npx firebase-tools use --add`.
3. Execute `npm run emulators` para Functions, Auth e Firestore.
4. Execute `npm run deploy` quando estiver pronto para publicar.

A região inicial é `southamerica-east1` (São Paulo). O endpoint público `health` retorna apenas o status do serviço. As regras Firestore negam todo acesso direto de clientes; o Admin SDK ignora essas regras, portanto as futuras ferramentas devem validar a identidade e isolar os dados por usuário no servidor.

## Escopo atual

Esta etapa entrega somente a base do projeto e um teste de diagnóstico. Ainda não implementa transporte MCP, autenticação de chamadas ou ferramentas de registro. Nenhum projeto Firebase foi criado ou publicado.

Próxima etapa: definir o fluxo de autenticação MCP com Firebase Auth e implementar ferramentas para registrar início e fim, sem cálculos ou relatórios. Não há uso de Firebase Storage.

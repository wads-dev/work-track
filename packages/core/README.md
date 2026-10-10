# @work-track/core

Núcleo neutro compartilhado pelo backend e frontend. Os exports são explícitos por contexto: não importe arquivos por paths físicos nem exports internos não declarados.

## Conteúdo

- `models/work` e `models/company-person`: modelos canônicos.
- `schemas/registration`: validação de criação/registro, separada dos decoders de documentos antigos em data.
- `contracts/*`: repositórios, gateway de comandos e DTOs de transporte.
- `registration/domain/*`: acesso, lifecycle e regras de edição/tópicos/projetos.
- `reports/domain/*` e `reports/application/*`: cálculos e casos de uso reutilizados nos dois runtimes.
- `daily-hours`, `pause`, `removal`, `merge`, `split`, `people`: modelos, contratos e regras dos respectivos contextos.

Não depende de Firebase, React, Express, MCP SDK, Node runtime ou apps. Regras compartilhadas NÃO são uma barreira de autorização do navegador: servidores e Security Rules continuam aplicando autorização.

## Desenvolvimento

`npm run build:packages` na raiz compila core antes de data. Os exports contêm source `development`, declarações `types` e JavaScript compilado `default`. Vite dev acompanha sources; produção/Node usam lib. Testes ficam junto dos módulos.

Para consumir: `import { executePersonalReport } from "@work-track/core/reports/application/get-personal-report"`.

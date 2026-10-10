# Work Track

Servidor MCP remoto em TypeScript para o projeto Firebase `wadsworktrack`. Implementa autenticação Google, projetos compartilhados, tópicos e registros pessoais de atividades.

## Conectar

Endpoint canônico: https://wadsworktrack.web.app/mcp

```sh
npx -y mcp-remote https://wadsworktrack.web.app/mcp
```

Configuração de um cliente MCP baseado em stdio:

```json
{
  "mcpServers": {
    "work-track": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://wadsworktrack.web.app/mcp"]
    }
  }
}
```

O cliente descobre o OAuth, registra seu callback, abre o navegador e solicita login Google. Confira o nome do cliente e o endereço de retorno antes de autorizar. Somente usuários com e-mail verificado @wads.dev e login Google recebem acesso ao MCP.

A ferramenta temporária `whoami` permite confirmar a identidade autenticada. Ela não registra trabalho. Estão disponíveis search_projects, create_project, create_topic e register. Projetos são compartilhados; registros ficam separados por usuário. Todo projeto nasce com tópico Geral. A busca V1 usa similaridade textual, não embeddings. O registro preserva texto, interpretação, início, fim opcional, momento da fala opcional e timestamp do servidor. Não divide tempo automaticamente nem encerra outros registros. requestId evita duplicações em retries.

## Arquitetura e segurança

- Firebase Hosting: página de login e origem HTTPS estável.
- Firebase Functions de segunda geração: Express, OAuth e MCP Streamable HTTP sem estado de transporte.
- Firebase Auth: login Google e verificação do ID token, incluindo revogação e login recente.
- Firestore Standard, banco (default): clientes OAuth, solicitações, códigos e tokens persistidos entre instâncias.
- OAuth: descoberta RFC 8414/RFC 9728, registro dinâmico, PKCE S256, consentimento explícito e redirects registrados.
- Códigos expiram em 2 minutos e são consumidos uma única vez via transação.
- Access tokens opacos expiram em 1 hora e são vinculados ao recurso MCP. Apenas hashes dos tokens são persistidos.
- Refresh tokens expiram em 7 dias e são rotacionados em cada uso.
- A cada chamada, contas desativadas, revogadas ou fora do domínio são recusadas.
- ID tokens Firebase não são aceitos diretamente como tokens MCP nem repassados para o cliente.
- As regras Firestore permitem leitura de projetos a contas Google verificadas @wads.dev e leitura dos próprios registros pelo UID do caminho. Escritas cliente e dados OAuth ficam negados. O Admin SDK usa IAM e as verificações do servidor.
- Sem Identity Platform: uma conta externa pode autenticar no Firebase, mas não pode obter autorização MCP.

Região Functions: southamerica-east1. O banco existente fica em nam5; nenhuma migração de região é feita nesta etapa.

## Arquitetura

Monorepo npm com apps/backend (Express/MCP), apps/frontend (React/Vite), packages/core (modelos, contratos, schemas e domínio/aplicação pura) e packages/data (codecs, portas e repositórios compartilháveis). Apps usam exports públicos dos pacotes, sem imports cruzados. SDKs Firebase e comandos autoritativos continuam nas aplicações. Consulte [arquitetura](docs/architecture.md) e [deploy](docs/deployment.md).

## Desenvolvimento

Node.js 22 e npm. Execute `npm ci`, depois `npm run check` para formatação, ESLint, tipos, testes e build.

- `npm run format`: Prettier.
- `npm run lint:fix`: correções de lint.
- `npx vitest` dentro de apps/backend: testes contínuos.
- `npm run dev --workspace @work-track/frontend`: desenvolvimento React, quando solicitado.

Husky/lint-staged validam commits, e GitHub Actions executa o check completo. Os testes usam identidades falsas exclusivamente em testes; a Function publicada usa Firebase Admin real.

## Firebase

Projeto: `wadsworktrack`. Plano Blaze necessário. O CLI foi autenticado com configuração local ignorada pelo Git.

```sh
XDG_CONFIG_HOME="$PWD/.firebase-cli" npx -y firebase-tools@latest login
XDG_CONFIG_HOME="$PWD/.firebase-cli" npx -y firebase-tools@latest deploy --only functions,hosting,auth,firestore:rules --project wadsworktrack
```

A configuração Google usa o e-mail de suporte victor@wads.dev e os domínios Hosting do projeto. Configurações públicas do app web são obtidas da rota reservada do Hosting `/__/firebase/init.json`; não é necessário distribuir segredo OAuth ao cliente.

## Verificação

Em 08/10/2026, o deploy foi concluído e o teste real com mcp-remote 0.14.3 completou o login Google, inicializou o MCP, listou ferramentas e chamou whoami com a conta @wads.dev. Os dez testes automatizados passaram. O cliente emitiu avisos SEP-2352 sobre sua persistência de descoberta OAuth; a conexão funcionou, mas esse suporte do cliente precisa ser acompanhado nas atualizações.

Execute `npm run smoke:mcp` para testar o proxy real `npx mcp-remote`. O navegador solicita login; após autorização o teste lista ferramentas e chama `whoami`. Tokens ficam em uma pasta local ignorada pelo Git. Não compartilhe esses arquivos nem os códigos OAuth.

O build usa a conta padrão Compute com `roles/cloudbuild.builds.builder`; o runtime usa `roles/datastore.user` e `roles/firebaseauth.viewer`. Não foi concedido papel Editor. O hook de preparação pula Husky em produção. A limpeza de imagens do Artifact Registry está configurada para um dia.

## Aplicativo instalável (PWA)

A interface React inclui uma identidade visual própria, favicon SVG/ICO, ícones Apple/Android e manifest com abertura em janela independente. Em Chrome/Edge/Android, use **Instalar aplicativo** quando o navegador oferecer a instalação (ou o menu do navegador). No iPhone/iPad, use Safari → Compartilhar → Adicionar à Tela de Início.

O service worker armazena apenas ícones públicos e uma tela informativa sem conexão. Registros, respostas de APIs, OAuth e Firebase Auth não são armazenados no cache do PWA. Consultar ou alterar atividades requer internet; as permissões e o login continuam os mesmos. Atualizações pedem confirmação antes de recarregar. O service worker é gerado apenas no build de produção.

Validação: `npm run test --workspace @work-track/frontend` e `npm run build --workspace @work-track/frontend`. Publicação somente da interface: `XDG_CONFIG_HOME="$PWD/.firebase-cli" npx -y firebase-tools@latest deploy --only hosting --project wadsworktrack`.

## Limites atuais

Teste real do login precisa de interação humana com a conta Google. Rate limiting do SDK é por instância, não global; Functions limita o número de instâncias. Documentos de credenciais expiradas são recusados, mas limpeza automática/TTL ainda deve ser configurada antes de uso em escala.

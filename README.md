# Work Track

Servidor MCP remoto em TypeScript para o projeto Firebase `wadsworktrack`. Esta etapa implementa autenticação; Search Projects e Register serão adicionados depois.

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

A ferramenta temporária `whoami` permite confirmar a identidade autenticada. Ela não registra trabalho. Nenhuma ferramenta de projetos ou registros está implementada nesta etapa.

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
- As regras Firestore negam todo acesso direto, incluindo dados OAuth. O Admin SDK usa IAM e as verificações do servidor.
- Sem Identity Platform: uma conta externa pode autenticar no Firebase, mas não pode obter autorização MCP.

Região Functions: southamerica-east1. O banco existente fica em nam5; nenhuma migração de região é feita nesta etapa.

## Desenvolvimento

Node.js 22 e npm. Execute `npm ci`, depois `npm run check` para formatação, ESLint, tipos, testes e build.

- `npm run format`: Prettier.
- `npm run lint:fix`: correções de lint.
- `npm run test:watch`: testes contínuos.

Husky/lint-staged validam commits, e GitHub Actions executa o check completo. Os testes usam identidades falsas exclusivamente em testes; a Function publicada usa Firebase Admin real.

## Firebase

Projeto: `wadsworktrack`. Plano Blaze necessário. O CLI foi autenticado com configuração local ignorada pelo Git.

```sh
XDG_CONFIG_HOME="$PWD/.firebase-cli" npx -y firebase-tools@latest login
XDG_CONFIG_HOME="$PWD/.firebase-cli" npx -y firebase-tools@latest deploy --only functions,hosting,auth,firestore:rules --project wadsworktrack
```

A configuração Google usa o e-mail de suporte victor@wads.dev e os domínios Hosting do projeto. Configurações públicas do app web são obtidas da rota reservada do Hosting `/__/firebase/init.json`; não é necessário distribuir segredo OAuth ao cliente.

## Verificação

Execute `npm run smoke:mcp` para testar o proxy real `npx mcp-remote`. O navegador solicita login; após autorização o teste lista ferramentas e chama `whoami`. Tokens ficam em uma pasta local ignorada pelo Git. Não compartilhe esses arquivos nem os códigos OAuth.

O build usa a conta padrão Compute com `roles/cloudbuild.builds.builder`; o runtime usa `roles/datastore.user` e `roles/firebaseauth.viewer`. Não foi concedido papel Editor. O hook de preparação pula Husky em produção. A limpeza de imagens do Artifact Registry está configurada para um dia.

## Limites atuais

Teste real do login precisa de interação humana com a conta Google. Rate limiting do SDK é por instância, não global; Functions limita o número de instâncias. Documentos de credenciais expiradas são recusados, mas limpeza automática/TTL ainda deve ser configurada antes de uso em escala.

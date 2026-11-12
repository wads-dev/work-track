# MCP local com Firebase Auth Emulator

Use o frontend Docker como origem única, não o endpoint interno da Function:

```json
{
  "mcpServers": {
    "work-track-local": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3400/mcp", "--allow-http"]
    }
  }
}
```

Reinicie a conexão do cliente e autorize usando uma conta Google sintética verificada @wads.dev no Auth Emulator. Nunca use credenciais de produção no demo.

O Vite encaminha /mcp, /.well-known, /register, /authorize, /token, /revoke, /flow e /complete para o serviço firebase. /login usa a página estática de consentimento, que conecta Auth Emulator quando o bootstrap identifica demo-work-track em loopback.

O backend só aceita origem HTTP loopback configurada quando FUNCTIONS_EMULATOR=true, projeto demo-work-track e ambos Auth/Firestore emulados estão presentes. Produção continua em https://wadsworktrack.web.app; overrides fora do emulador falham fechados. O Compose define WORK_TRACK_PUBLIC_ORIGIN usando FRONTEND_PORT; a inicialização encaminha esse valor por .env.local privado do container (não vai ao deploy).

Mantenha o hostname localhost da configuração consistente no cliente e no navegador. Portas parametrizadas são respeitadas pelo Compose. O endereço de acesso via host.docker.internal não está configurado como issuer confiável: este fluxo local destina-se a clientes executados no host.

Validação: descoberta local, registro OAuth, login real via popup Auth Emulator, troca PKCE por token e tools/list autenticado retornando 27 ferramentas; npm run check aprovado. Nenhuma nova Cloud Function ou bypass de autenticação.

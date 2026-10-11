# Retirada de callables e nome MCP

Retirados dos exports: getCalendarReport, getCompanyReport, getPersonalReport, getProjectReport e listProjects. Core, repositórios, handlers de testes e tools MCP são preservados. Frontend atual não chama esses endpoints.

Servidor passa a ser exportado como mcp. Rewrites /mcp, OAuth e /health apontam para mcp; URL pública permanece igual. api=mcp é apenas um alias transitório para preservar clientes durante a troca de Hosting, não uma nova API REST.

## Operação autorizada

1. Validar npm run check. Autenticar Firebase CLI local (ou usar credencial da CI).
2. node scripts/retire-unused-callables.mjs consulta inventário sem escrita.
3. node scripts/retire-unused-callables.mjs --execute exclui SOMENTE os cinco nomes existentes em southamerica-east1/wadsworktrack. --force aparece somente na exclusão explicitamente delimitada, nunca no deploy geral. Reexecução ignora ausentes.
4. Publicar Functions sem --force, preservando alias api e moveSubject.
5. Confirmar mcp ACTIVE antes de publicar Hosting e testar /mcp + OAuth.
6. Após confirmar Hosting, retirar api em alteração posterior e exclusão explícita. Não reaproveitar api para REST nesta etapa.

CI backend executa retirada com lista fixa após testes e antes do deploy. CI Hosting espera mcp ACTIVE antes de trocar rewrites. Não são apagados dados Firestore nem auditorias; somente endpoints de consulta descontinuados. Scripts de privacidade exercitam os handlers diretamente para preservar cobertura sem depender dos endpoints retirados.

Validação local: gate completo passou. Nenhum emulador/validação visual iniciado (mudança restrita aos endpoints e deploy). Deploy produção depende de credencial Firebase válida e verificação posterior; não anunciar publicação sem evidência.

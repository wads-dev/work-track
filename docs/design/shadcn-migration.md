# Migração completa para shadcn/ui

Frontend migrado de MUI/Emotion para componentes shadcn/ui oficiais (new-york), Radix e Tailwind CSS v4. Nenhuma camada de compatibilidade de MUI ou tradução de sx permanece.

- Componentes locais em `apps/frontend/src/components/ui`; utilitário `cn` em `apps/frontend/src/lib/utils.ts`.
- Registro configurado em `apps/frontend/components.json`, aliases em TypeScript/Vite; plugin Tailwind nos builds de produção e no frontend Docker de desenvolvimento.
- Tokens neutros claro/escuro, Geist auto-hospedado e Lucide. Tema do sistema com escolha explícita claro/escuro; reduced-motion e skip-link mantidos.
- Dialog/Sheet, Select, Checkbox e Tabs usam suas APIs Radix convencionais. Seletor pesquisável de projetos mantém combobox/listbox e navegação por teclado.
- Preservados autenticação corporativa, identidade das consultas, confidencialidade por UID, rotas/filtros, dados do calendário, confirmação/download prévio de exclusão permanente e demais mutações.
- Testes de marcação adaptados à nova estrutura mantendo contratos de autoria, privacidade e layout responsivo; regressão dedicada impede retorno de dependências MUI/Emotion.

Após atualizar dependências, reinicie somente o serviço frontend local (não os emuladores): `docker compose restart frontend`.

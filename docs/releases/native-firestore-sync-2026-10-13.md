# Firestore nativo — correção de produção

Substitui o protocolo próprio introduzido indevidamente: syncWorkspace, journal e triggers removidos. Persistência é a do SDK Firestore em IndexedDB; listeners globais de sessão sincronizam, as projeções são lidas por getDocsFromCache. Nenhuma data/filtro/rota determina alvos remotos. Blur/hidden chama disableNetwork, foco chama enableNetwork, mantendo resume tokens/targets SDK. Criação de projetos é Firestore transacional direto e gateway Web não possui fallback callable genérico.

Exceções existentes Admin: diretório completo Auth e exportação/exclusão permanente com inventário protegido; MCP/comandos administrativos preservados. Não alegar zero Functions em toda aplicação. Legacy próprio descoberto por createdBy; legacy compartilhado sem type de outro autor não é varrido remotamente por fallback.

Validação worktree Docker exclusiva worktrack-native-firestore-sync em localhost:5192 (Auth9122/Firestore8102/Functions5022/UI4022): ready/HMR, login emulado, relatório39h, criação projeto pessoal real via Web SDK,30 mudanças de período estabilizado com0 callables/0 addTarget/0 removeTarget, zero erros console.12 testes Rules reais passaram, incluindo GET missing para criação e isolamento privado. npm run check passou:913 testes (155core+31data+335backend+377frontend+15tooling), lint/types/build. Contêineres mantidos, sem dados de produção durante teste.

Publicação autorizada diretamente em main pelo usuário. Workflow retira somente getTopicReport/discoverLegacyProjectIds antigos e publica backend remanescente; frontend espera Rules/índices. Sem --force amplo nem retries novos. Reconexões SDK ainda têm regras normais de faturamento Firestore; não prometer custo remoto zero.

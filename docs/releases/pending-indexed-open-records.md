# Pendências indexadas sem paginação

Página e sino consultam registros canônicos por projeto autorizado com `where("endedAt", "==", null)`, sem limite ou cursor. O filtro de projeto preserva as regras atuais. Não foi criado endpoint de pendências; o catálogo existente ainda descobre projetos legados. Exclusões lógicas continuam ocultas; o sino conta abertos há mais de oito horas.

Firestore não retorna campos ausentes numa consulta `== null`. Escritores agora persistem null e leitores o normalizam para o contrato opcional do domínio.

## Rollout obrigatório

1. Implantar leitores compatíveis, escritores normalizados e regras que aceitam null sem mudar autorização.
2. Implantar índice composto records/COLLECTION/projectId ASC/endedAt ASC e aguardar READY (ID usa sufixo implícito).
3. Com ADC, revisar dry-run: `node scripts/backfill-record-ended-at.mjs --project wadsworktrack`.
4. Executar explicitamente com `--apply`. A migração pagina só a manutenção, não a tela; revalida cada documento em transação e altera somente endedAt ausente, preservando encerramentos concorrentes e evidências.
5. Só então publicar frontend. Workflows independentes não garantem a ordem: coordenar rollout antes do merge/publicação.

Nenhuma implantação ou migração em produção foi executada. Firebase CLI local retornou credenciais expiradas.

# Pendências indexadas sem paginação

Página e sino consultam registros canônicos por projeto autorizado com `where("endedAt", "==", null)`, sem limite ou cursor. O filtro de projeto preserva as regras atuais. Não foi criado endpoint de pendências; o catálogo exige projetos com `type` explícito `work` ou `personal`; ausência ou tipo inválido nega acesso, sem fallback. Exclusões lógicas continuam ocultas; o sino conta abertos há mais de oito horas.

Firestore não retorna campos ausentes numa consulta `== null`. O storage canônico exige `endedAt: string | null`, `deletedAt` presente (somente `null` ativo) e `topics` array obrigatório. Projetos exigem `type`, `archived` e `confidential` explícitos; tópicos exigem `archived` explícito. Leitores não recuperam automaticamente campos ausentes.

A [migração de produção](../project-type-migration.md) foi concluída em 14/10/2026: 13 projetos e 446 registros, zero campos canônicos ausentes no inventário final. Não há guards de migração/publicação na CI para esse rollout, removidos a pedido humano.

## Plano histórico de rollout

1. Implantar leitores compatíveis, escritores normalizados e regras que aceitam null sem mudar autorização.
2. Implantar índice composto records/COLLECTION/projectId ASC/endedAt ASC e aguardar READY (ID usa sufixo implícito).
3. Com ADC, revisar dry-run: `node scripts/backfill-record-ended-at.mjs --project wadsworktrack`.
4. Executar explicitamente com `--apply`. A migração pagina só a manutenção, não a tela; revalida cada documento em transação e altera somente endedAt ausente, preservando encerramentos concorrentes e evidências.
5. Só então publicar frontend. Workflows independentes não garantem a ordem: coordenar rollout antes do merge/publicação.

Na elaboração original deste plano, nenhuma implantação ou migração em produção havia sido executada e o Firebase CLI local retornou credenciais expiradas. Essa evidência é histórica; a migração de produção foi posteriormente concluída conforme a nota acima.

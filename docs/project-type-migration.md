# Dados canônicos e migração Web

## Execução em produção — 14/10/2026

A migração foi executada pelo Firebase Web SDK no navegador apontado para `wadsworktrack`, após prévia e backup privado fora do Git. A primeira etapa usou a conta corporativa autorizada; a etapa restante usou uma instância separada sem Auth, durante a janela de Rules temporária publicada pelo usuário. Não houve deploy de aplicação ou Rules pelo agente.

Inventário completo final: **13 projetos e 446 registros**. Verificado no servidor: zero `type`, `archived` ou `confidential` ausente nos projetos; zero `archived` ausente nos tópicos; zero `endedAt` ou `deletedAt` ausente nos registros; zero aliases `mergedIntoTopicId` no catálogo.

Patches: `type: "work"` somente em projetos sem tipo, flags boolean explícitas preservando o estado anterior, `endedAt: null` e `deletedAt: null` somente quando ausentes. Marcadores de remoção presentes não foram alterados. Tópicos sem archived receberam false. Um alias sem referências em allocations/snapshots operacionais foi removido após validar destino existente. Auditorias e comprovantes de exportação não foram reescritos.

As escritas ocorreram em transações com releitura e comparação canônica dos dados de origem. A primeira etapa atualizou 263 documentos; a segunda 128, incluindo documentos de projetos já tocados para normalizar tópicos, mais uma atualização de catálogo para eliminar o alias. Todas as alterações previstas foram relidas; nenhuma alteração inesperada foi encontrada. Backups privados contêm conteúdo confidencial e não entram no PR.

O usuário foi avisado para restaurar as Rules normais imediatamente após a verificação final. Não manter acesso público para desenvolvimento ou testes.

## Contrato atual

Projetos exigem `type: "work" | "personal"`, `archived` e `confidential` boolean. Tópicos têm archived boolean. Registros persistem `endedAt: string | null`, `deletedAt: null` quando ativos e topics array; tombstones são preservados. Writers devem produzir esse formato; leitores não recuperam automaticamente campos ausentes. Confidencialidade continua apresentação, não ACL.

A migração não é responsabilidade da CI. Foram removidos os três guards de publicação adicionados no draft anterior. Scripts administrativos de migração são ferramentas operacionais, não caminhos de leitura do aplicativo.

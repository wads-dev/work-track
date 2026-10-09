# Pausa concluída via MCP

`register_pause` recebe `durationMinutes` positivo e menor que 1440, `resumedAt` ISO com fuso referente ao momento da fala/retomada, `requestId` estável, `reason` e `originalUtterance`; `recordId` é opcional apenas quando existe exatamente um registro elegível. Não utiliza o momento de recebimento como retomada nem infere minutos ausentes.

Somente registro próprio aberto iniciado há menos de 24h em relação à retomada. Fala precisa ser passada e ter menos de 24h em relação ao servidor. A pausa não pode começar antes do início do registro. Zero elegíveis, múltiplos sem seleção, projeto inacessível/arquivado/em merge, tópico inválido e contexto incompleto resultam em erro sem alteração. A descoberta automática examina no máximo 1000 registros próprios: excedido, requer ID explícito, sem resposta parcial.

Uma transação fecha a origem em `resumedAt − durationMinutes`, cria registro de retomada no mesmo projeto/contexto em `resumedAt`, preserva evidência original da origem e salva auditoria imutável antes/depois com motivo e fala. Não registra o intervalo da pausa como trabalho. Percentuais são preservados; alocações absolutas de minutos por tópico e interrupções históricas exigem conciliação separada, não são duplicadas nem redistribuídas.

Repetição exata de `requestId` e intenção retorna os mesmos IDs sem criar novos registros. Intenção diferente, contexto posteriormente alterado ou perda de acesso impedem reaplicação. O UID vem exclusivamente do OAuth autenticado.

## Intenção futura não é pausa concluída

“Agora vou dar uma pausa” deve usar `update_record` para encerrar o registro explicitamente escolhido no momento da fala. Não chamar `register_pause`, não criar retomada e não adivinhar quando o usuário voltará.

## Exemplo

Registro começou às 09h; usuário diz às 12h “acabei de voltar de uma pausa de uma hora”. Com `durationMinutes: 60`, encerrar a origem às 11h e iniciar a retomada às 12h. Sem registro recente, informar que não há registro aberto iniciado nas últimas 24h para pausar, indicando conciliação separada quando pertinente.

## Limite atual da auditoria

A auditoria desta ferramenta fica em `users/{uid}/pauseAudits/{id}` para o backend confiável. As Rules atuais negam leitura direta dessa coleção: o drawer de histórico existente não exibe a pausa nesta entrega. Nenhuma Rule ou tela foi alterada para essa ferramenta. Auditoria nova não remove nem reescreve auditorias existentes.

## Validação e publicação

12 testes cobrindo contrato, transação simulada, idempotência, ACL, metadados malformados e catálogo MCP autenticado; lint, typecheck e diff check passaram. Ainda sem prova runtime Firestore da nova pausa. Implementação em commit separado; NÃO integra a release pendente congelada `708fbba`, e NÃO foi publicada em produção.

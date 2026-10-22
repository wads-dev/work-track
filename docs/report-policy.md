# Política de contabilização V4

O tempo padrão de relatórios é **contabilizado**: cada trecho é dividido igualmente entre as atividades simultâneas da mesma pessoa. Não é uma medição de atenção. Pessoas diferentes nunca dividem tempo entre si.

## Motor compartilhado

O pacote `@work-track/core` contém o motor de rateio em `accounted-time.ts`, consumido pelos relatórios pessoal, empresarial, por projeto, tópico e horas do dia. Frontend e backend importam os mesmos casos de uso e domínio. A interface só formata e integra trechos já calculados para o recorte diário; não determina simultaneidade usando os eventos visíveis.

O motor percorre eventos de início/fim por autor, usando intervalos semiabertos [início, fim). Os minutos são somados sem arredondamento intermediário. Filtros de projeto, tópico, período, arquivados e paginação não retiram atividades do contexto de rateio. Somente registros ativos e autorizados participam. Mantêm-se ACLs, consultas locais indexadas e limites operacionais existentes; contexto incompleto/inválido falha explicitamente, nunca retorna um total parcial silencioso.

## Fatos e estimativas

Início/fim originais não são alterados. Fechados podem atravessar dias ou ultrapassar oito horas. Abertos usam estimativa não persistida até agora, no máximo seis horas, limitada à meia-noite do registro e do fuso canônico America/Sao_Paulo. **O próximo início não corta mais o aberto**, inclusive no mesmo projeto; ele participa do rateio. Não há teto diário nem saldo cronológico. Interrupções textuais não são descontadas automaticamente.

## Logged e apresentação

- `minutes` e `totalMinutes` são contabilizados.
- `loggedMinutes` é a duração do intervalo efetivo antes do rateio, recortada no mesmo período.
- `accountingSegments` transporta somente limites e quantidade de atividades concorrentes, sem identidade ou conteúdo dos outros registros. Permite recortar corretamente dias sem usar a média do registro inteiro.
- Calendário: `3h (logged: 4h)` quando houver diferença; caso contrário apenas `4h`. Totais da legenda seguem a mesma convenção.
- Detalhe isolado: apenas `Logged` e a duração entre início/fim, com aviso de que o contabilizado pode ser menor. Aberto não recebe fim inventado.
- Nenhum campo derivado é persistido; não há migração dos registros. Histórico passa a ser recalculado pela V4.

## Tópicos

Um único tópico sem alocação recebe os minutos contabilizados. Percentuais explícitos usam esses minutos; vários tópicos sem distribuição continuam não distribuídos. Durações absolutas informadas permanecem intactas na fonte e recebem proporcionalmente a redução do intervalo por sobreposição (minutos contabilizados / logged). Isso não inventa horários internos de tópicos. Alocações que excedem o intervalo continuam rejeitadas com aviso, sem normalização silenciosa.

## Exemplo de aceitação

A: 13h–17h; B: 14h–16h, mesma pessoa. A recebe 1h + 1h + 1h = 3h; B recebe 1h. Total contabilizado 4h; logged A 4h e B 2h. A regra é a mesma com A ainda aberto às 17h dentro dos limites de estimativa. Filtrar apenas A não muda suas 3h. Recortar 14h–16h atribui 1h para cada tarefa.

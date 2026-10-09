# Política de relatório V3

Relatórios projetam intervalos sem modificar início/fim original. Fatos com fim explícito são preservados mesmo acima de oito horas ou atravessando dias.

## Orçamento global por pessoa/dia

O limite de oito horas é global para estimativas por pessoa/dia, somando todos os projetos, independentemente da página exibida. O dia do orçamento usa America/Sao_Paulo nos relatórios de projeto e pessoal. Alterar o fuso visual do calendário não cria outro saldo.

Fatos fechados são descontados da margem diária sem truncamento. O saldo restante vai para abertos em ordem de início/ID determinística: até quatro horas por registro, limitado por agora, meia-noite do registro e do orçamento, próximo início da mesma pessoa no mesmo projeto (ignorar candidato fechado com duração menor que 15 minutos) e saldo restante do dia. Não há divisão igual automática entre abertos, nem persistência de fins estimados.

## Contexto completo e paginação

O backend lê contexto completo das pessoas envolvidas antes de calcular. Os relatórios agregam toda a seleção, inclusive registros encontrados em páginas internas; não apresentam a primeira página como total global. Sem datas, consultam todo o histórico. Início e fim são filtros opcionais independentes; quando ambos existem, o intervalo aceita até 93 dias e 1 hora. Filtro de projeto altera somente a seleção, nunca o orçamento global. Próximos inícios e fatos de outros projetos continuam afetando estimativas corretamente.

O protótipo limita leitura a 2000 registros por pessoa, 2000 registros na seleção e 10 pessoas por consulta para proteger custo/recursos. Contexto incompleto/inválido falha explicitamente; não é substituído por estimativa local chamada global. Limite por pessoa requer evolução da leitura/indexação, não exclusão de evidências.

Sobreposições são somadas, não união de intervalos. Um tópico único recebe o intervalo; vários tópicos sem divisão ficam Não distribuído. Alocações informadas são preservadas com warning se excedem o tempo.

Callables exigem Firebase Auth Google verificado @wads.dev. Estimativas não devolvem texto original nem transcrição. Edição, merge e calendário já estão implementados; revisão/testes no emulador das regras permanecem backlog.

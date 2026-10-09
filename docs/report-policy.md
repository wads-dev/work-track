# Política de relatório V1

Relatórios calculam uma projeção; não modificam início/fim original. Fim explícito é preservado mesmo além de oito horas ou atravessando dias. Registro aberto estima o menor entre agora, início+4h, meia-noite no fuso do registro e próximo início do mesmo usuário/projeto presente na página.

Orçamento de oito horas limita apenas estimativas, descontando fatos fechados do usuário/dia no projeto/página consultados. **Não é limite global de toda a rotina**, pois o relatório V1 consulta um projeto paginado. Totais e gráficos são desta página; próximo registro fora dela pode afetar conciliação futura. Avisos expõem essas limitações.

Tempos simultâneos são somados; o total não representa união de intervalos ou horas líquidas. Um tópico único recebe o intervalo; vários tópicos sem divisão informada ficam Não distribuído. Percentuais/durações informados são respeitados, com warning se excedem tempo. Gráficos representam a soma de suas fatias, não uma distribuição inventada.

Callable getProjectReport usa Firebase Auth Google verificado @wads.dev, dados agregados e intervalos resumidos sem texto original/transcrições. Edição/conciliação, merge projetos e calendário pessoal são entregas posteriores.

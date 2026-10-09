# Correção de orçamento diário global

## Regra solicitada

Oito horas é o orçamento por pessoa/dia, somando todos os projetos, independente da página de visualização. Fatos com fim explícito permanecem intactos, mesmo acima de oito horas, mas descontam o saldo disponível para estimativas.

O saldo vai para registros abertos em ordem de início e ID determinístico. Cada aberto respeita no máximo quatro horas, agora, meia-noite e próximo início próprio. Não repartir igualmente entre todos nem gravar fim calculado. Exemplo sem fatos fechados: abertos que comportam quatro horas cada recebem 4h, 4h, 0h e 0h. Com seis horas fechadas, sobra até2h para os abertos. Com fatos fechados acima de8h, não estimar novas horas nesse dia.

## Contexto versus visualização

A página seleciona apenas o que será mostrado e agregado. O cálculo deve receber contexto completo da pessoa em todos os projetos antes de selecionar os resultados da página. Se o limite operacional impedir contexto completo, falhar explicitamente em vez de produzir estimativa local e chamá-la global.

O fuso do orçamento deve ser canônico e consistente entre relatórios; mudar o filtro visual não pode ganhar novo saldo. O contrato da implementação especificará o fuso.

## Testes de aceitação

- Diferentes projetos/páginas não reiniciam orçamento.
- Resultado de um registro é igual em relatório de projeto e pessoal com mesma referência temporal.
- Fatos explícitos e evidências originais nunca truncados/mutados.
- Próximo início fora da página afeta estimativa corretamente.
- Fusos, transições de horário e limites operacionais têm comportamento explícito.

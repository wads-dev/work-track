# Histórico mensal e planejamento

Na aba **Histórico** de um projeto com contratação cadastrada:

- Cada mês mostra dias úteis do calendário (segunda a sexta, excluindo feriados), datas distintas de feriados cadastrados, quantos caem em dias de semana e dias com meta positiva de contratação.
- **Meses futuros** aceita de 0 a 24 meses além do atual. Padrão: 0. Os meses futuros são marcados como previsão. Contratos com fim e mudanças de carga são respeitados; não há meta fora da vigência.
- Feriados usam o calendário compartilhado cadastrado, sem inferir localização ou completar feriados ausentes. Anuais respeitam mês/dia e anos bissextos; específicos valem apenas na data cadastrada. Feriados coincidentes contam uma única data, inclusive quando um anual coincide com um específico. Feriado no fim de semana não desconta novamente um dia útil.

## Saldo opcional

**Transportar saldo entre meses** vem desligado. É uma opção de visualização da tela, não uma alteração de contratos, registros, faturamento ou fechamento contábil. Não é persistida entre remontagens da tela.

Ligado, calcula cronologicamente desde o primeiro mês do contrato ou registro (o que vier antes), com saldo inicial zero:

**saldo anterior + horas entregues − meta mensal = saldo seguinte**

Créditos e débitos passam por meses intermediários sem registros e meses sem meta. O histórico inclui meses contratados sem registros, para não omitir débitos. As metas e entregas originais permanecem nos números. Na barra, crédito anterior aparece em azul no início e desloca as entregas para a direita. Débito anterior aparece como uma faixa rosa semitransparente e hachurada sobre a cauda das entregas do mês, consumindo primeiro horas extras fora da escala visível. Se o débito superar as entregas, a cauda cobre toda a entrega e o restante é indicado em texto. Mês sem meta não tem escala para desenhar saldo. A legenda e os valores completos permanecem disponíveis mesmo quando a escala da barra é excedida. Com o toggle desligado, não há segmentos de saldo.

Além do saldo seguinte, mostra a posição até hoje (saldo anterior + entregas − meta esperada até hoje) e as horas ainda necessárias para cobrir a meta mensal com o saldo, nunca abaixo de zero.

Mês atual e meses futuros têm saldo **projetado** considerando somente entregas já disponíveis, sem supor novas entregas. Estimativas de registros abertos continuam seguindo a política do relatório; saldos históricos também podem incluir essas estimativas. O cálculo não é um fechamento definitivo.

A projeção e o toggle recalculam os mesmos dados autorizados localmente, sem novas assinaturas remotas por alteração de controles. Relatórios incompletos e históricos além do orçamento de 100 anos geram erro explícito, nunca totais parciais.

## Validação desta implementação

- Regressões de calendário, contratos parciais/finitos, virada de ano, limites do horizonte, saldo positivo/negativo, meses vazios, relatório incompleto e apresentação sem saldo por padrão.
- Ambiente Docker exclusivo com Auth, Firestore e Functions em demo-work-track; login fictício da fixture do repositório.
- Navegador: horizonte 0/3 meses, virada para janeiro, toggle ligado/desligado, saldo negativo, calendário/meta, módulos sem erro, bootstrap com portas isoladas e largura móvel de 390 px sem overflow após estabilizar o layout.
- A fixture original não contém feriados; casos de feriados são cobertos por testes automatizados, não por dados de produção.

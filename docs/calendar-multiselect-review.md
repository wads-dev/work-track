# Revisão: filtros múltiplos e multiplicadores

## Três fluxos para revisão humana

1. **Projetos:** no calendário, marque X e Y. Ambos aparecem; a legenda soma somente a seleção. Limpar retorna a todos. Recarregue e volte/avance no navegador: a URL preserva as seleções. Links antigos com projectId continuam válidos.
2. **Pessoas:** marque duas pessoas. Os eventos mostram suas identidades e os totais somam somente a seleção. Limpar seleciona todas; Meu calendário é apenas a pessoa autenticada. O perfil de uma pessoa mantém sua seleção fixa. O modo confidencial mascara projetos, nunca o diretório de pessoas.
3. **Multiplicadores:** no editor de projeto, configure uma pessoa com base 0,25 e nova vigência 0,5. Datas exigem ISO com offset explícito; vigência vazia significa null. Registros iniciados antes da mudança mantêm 0,25 até o fim, inclusive no recorte posterior do relatório. Registros iniciados no instante exato usam 0,5. Sem regra aplicável, fator 1.

## Cálculo esperado

- Logged não muda. Rateio considera todas as atividades autorizadas simultâneas da mesma pessoa, inclusive projetos ocultos pelo filtro.
- Computado = tempo após rateio × fator do projeto/pessoa no início original.
- Sênior1h ×1 + júnior4h ×0,25 = 2h computadas, 5h logged.
- Uma atividade de 4h logged com 3h após rateio e fator0,25 mostra 45min (logged: 4h); tooltip explica as etapas.
- Fator0 é permitido; fatores maiores que1 também exibem logged quando houver diferença.

## Componente compartilhado nas outras telas

Dashboard, Meu relatório, Meus Registros e Calendário usam a mesma multisseleção de projetos com busca e checkboxes. Selecione Atlas + Portal em cada tela e recarregue para conferir a URL e o resultado. Limpar significa todos; tópico exige exatamente um projeto. O editor de um registro mantém o modo simples do mesmo ProjectSelector, pois um registro pertence a apenas um projeto. A seleção de pessoas do calendário usa o mesmo primitive MultiSelect, sem cópia de implementação.

## Consultas e limites

Seleções são aplicadas no repository por queries Firebase nativas nos campos projectId e uid usando in; não há filtro de registros na view/hook. Até100 projetos e100 pessoas na entrada, sem truncamento de IDs. Shards conservadores mantêm produto de disjunções até10, abaixo dos limites DNF30 e componentes100 nas formas atuais. As três consultas de interseção temporal são separadas. Os resultados físicos ordenados e cursores são mesclados por caminho completo; contexto de rateio permanece independente dos filtros. Limites operacionais preexistentes (pessoas com contexto, registros/páginas) geram erro explícito, nunca total parcial. Tópico e semanas com atividade exigem exatamente um projeto.

## Segurança e histórico

Mapa timeMultipliers fica no projeto e é legível por seus leitores autorizados. Escritas passam diretamente pelo Firebase SDK do frontend, sem callable, com schema compartilhado, compare-and-set do mapa anterior e auditoria em transação. Firestore Rules preservam as ACLs do projeto e permitem editar o mapa por SDK. Validação detalhada e CAS são garantias do cliente oficial; consumidores falham explicitamente para configurações inválidas. Alterar/remover uma regra antiga recalcula o histórico; acrescente nova vigência para mudanças futuras. Nenhum tempo derivado é persistido nos registros.

## Estado da validação

O roteiro acima é de aceitação, não evidência de teste visual realizado. Registrar resultado real de testes e ambiente no PR. Usar somente demo-work-track e dados sintéticos na validação local; não alterar produção.

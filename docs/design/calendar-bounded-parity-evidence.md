# Calendário: filtros e limites da evidência

Nota de evidência — 2026-10-09. Código em desenvolvimento; sem afirmação de publicação ou desempenho autenticado.

## Implementação

O frontend executa o caso de uso de calendário existente com repositório Firebase Web SDK. A autorização é pelo projeto atual: work/público para usuários autenticados e pessoal somente para seu proprietário, independentemente do autor de um registro autorizado. Não há projeções nem reescrita dos cálculos backend.

A seleção visível aplica projectId e filtros startedAt/endedAt no Firestore antes da transferência. Os limites lexicais incluem margem de dois dias em cada extremidade para timestamps ISO com offsets; o caso de uso realiza o recorte exato do intervalo. Branches distintas preservam abertos e registros iniciados antes da janela.

A fonte autorizada mantém uma consulta adicional de histórico completo por projeto para contexto. O orçamento company-v3 precisa do contexto work entre projetos da pessoa; filtrar esse contexto apenas pelo projeto escolhido alteraria o cálculo. Portanto, seleção indexada não significa transferência total limitada ao período, nem contexto mínimo já implementado.

## O que os testes estabelecem

Fixtures temporais verificam igualdade numérica finita do recorte, limites, offsets, ordenação e orçamento entre projetos. Não demonstram paridade de todo o contrato histórico: contagens, avisos, erros e limites operacionais podem depender do histórico completo. Limite de registros no caso de uso não é cap de documentos transferidos pelo SDK.

Foram reportados 35 testes focados e um checkpoint frontend de 194 testes aprovados antes da alteração final 526. Os 10 testes finais de Rules foram reportados na base 7cc03b; a transição ativa 384 ainda aguardava testes. Não há aprovação integral final registrada por esta nota.

## O que não foi medido

A inspeção de produção disponível mostrou login, não calendário autenticado. Bundle/HTTP 200 ou bytes do shell não comprovam versão de commit, registros autorizados, número de listeners, chamadas de relatórios, latência ou custo de dados. Não se afirma ganho de desempenho nem conclusão da migração com esses dados.

Veja [repositórios](frontend-report-repositories.md) e [cache/coerência](frontend-cache-isolation-review.md).

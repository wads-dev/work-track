# Performance do calendário: consultas locais

## Alterações

- Seleção completa opcional nas portas de relatório evita drenar páginas de100 lendo novamente o sufixo. Adapter Web consulta o SDK cache uma vez por ramo/shard, mantém os limites de2001 físicos por consulta e2000 registros na união, e falha explicitamente em overflow. Outros adapters continuam na paginação anterior. Revalidações de ACL/contexto completo não são memoizadas.
- Descrições: consultas nativas por proprietário, documentId IN até30, projetos pais únicos e concorrência máxima8; estado somente durante a chamada, sem cache de ACL entre execuções.
- Revisões independentes de conteúdo e auditoria impedem publicação redundante por confirmação somente de metadados. Primeira confirmação remota, erros, edições de tamanho constante, exclusões e alterações de projeto continuam invalidando.
- Densidade, dia selecionado dentro do mesmo período e apresentação deixam de integrar a identidade do cálculo; limites temporais continuam na identidade.
- Diagnóstico opt-in existente agora inclui performance.start/end, stage, requestId e durationMs para cálculo e descrições, sem conteúdo de registros.

## Evidência

Contagens determinísticas sintéticas, não latência de produção:

| Cenário                            | Antes                         | Depois                      |
| ---------------------------------- | ----------------------------- | --------------------------- |
| 1000 registros, pessoal ou empresa | 10 consultas /5500 documentos | 1 consulta /1000 documentos |
| 128 descrições,1 projeto           | 256 leituras                  | 6 consultas,129 documentos  |
| 300 descrições,300 projetos        | 600 leituras                  | 20 consultas,600 documentos |

Fixture de benchmark local,1000 registros,1 warmup e5 amostras alternadas: medianas pessoal162,34ms →25,16ms; empresa168,08ms →30,48ms. Não são medições de IndexedDB real nem do tempo total da tela. Sem threshold de tempo em CI.

Navegador com Docker isolado, demo-work-track: semana de06/10/2026 carregou14h52,5min; cálculo51,6ms e descrições2,7ms em uma amostra pequena. Alterar Régua→Compacto preservou total e gerou zero cache.read e zero performance.start, somente people.memory.read. Console sem erros. Não é comparação de latência de produção.

## Limites mantidos

Não habilitamos leitura de sessão anterior antes da confirmação de acesso: o cache persistente SDK não prova autorização atual nem completude e pode sobreviver à troca de contas. Readiness continua exigindo confirmação remota dos catálogos e grupos autorizados. Sem novos listeners por tela, Functions, índices remotos ou alteração de Rules. Histórico completo necessário ao rateio e revalidações finais permanecem. O primeiro reload ainda depende da rede; essa fase exige projeto separado de segurança/completude, não um flag de localStorage.

## Revisão manual

Abrir calendário com date=2026-10-06&view=week no ambiente demo. Habilitar localStorage.setItem("work-track:firestore-debug","1") e recarregar para capturar cache.indexes e estágios em window.__workTrackFirestoreDebug. Limpar o log com clear(), trocar densidade e verificar ausência de novas consultas/cálculos, mantendo total. Navegar período deve calcular de novo. Projetos confidenciais continuam mascarados e pessoas identificadas.

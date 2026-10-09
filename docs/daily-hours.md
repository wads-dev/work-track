# Consulta diária de horas (somente leitura)

## Release verificada

Publicado em 2026-10-09 com deploy isolado `--only functions:api --project wadsworktrack`. CLI exit0; OAuth real em `https://wadsworktrack.web.app/mcp` confirmou `get_daily_hours` anunciado como somente leitura, consulta do dia `2000-01-01` (zero fechado/estimado) e rejeição de `2026-02-30`. Smoke exit0. Nenhum registro foi criado, alterado ou removido; Hosting, Rules e demais functions não foram publicados nessa release.

MCP: get_daily_hours. Requer OAuth existente; consulta somente a coleção canônica do usuário autenticado. Não aceita uid, não registra atividades, não fecha intervalos, não importa e não altera planilha ou histórico.

## Entrada

- date: obrigatório, dia real YYYY-MM-DD (sem hora).
- timeZone: IANA, padrão America/Sao_Paulo, sempre explícito na resposta.
- projectId: opcional; omitido soma todos os projetos acessíveis com registros próprios.
- includeArchived: padrão true para conciliação histórica. false oculta arquivados/mesclados da seleção, não do orçamento global.

## Saída e limites

Resposta com scope: own, date, timeZone, asOf, bounds (início inclusivo/fim exclusivo UTC e duração real do dia, inclusive DST), totalMinutes/Hours, closedMinutes/Hours, estimatedMinutes/Hours, byProject com os mesmos totais, intervals e warnings. Minutos/horas são decimais, sem arredondamento intermediário.

Cada intervalo conserva startedAt e endedAt originais; aberto não recebe endedAt. effectiveStartedAt/effectiveEndedAt são exclusivamente o recorte calculado do dia. estimated identifica abertos, não fatos; minutes representa o recorte.

Reutiliza a política personal-v3 existente: todos os fatos próprios de projetos autorizados contam para orçamento global de 8h por pessoa/dia America/Sao_Paulo, antes de filtros. Fechados preservados integralmente. Estimativas abertas limitadas a 4h, agora, meia-noite do registro e do orçamento, próximo início próprio no mesmo projeto (fechados menores que 15min não cortam) e saldo cronológico global. Sobreposições somadas, não automaticamente reconciliadas.

Histórico e metadados são carregados em transação Firestore readOnly: true, em páginas de 500 até conclusão. Limite operacional de 2000 registros próprios: exceder ou encontrar registro autorizado inválido causa erro, nunca total parcial. A identidade dentro do payload histórico não concede acesso: o caminho canônico users/{uid autenticado}/records determina o dono.

ACL independente read-only: projeto legado sem type é work; work acessível; personal apenas createdBy correspondente; tipo malformado nega acesso. Referências históricas pessoais estrangeiras são excluídas antes de interpretar datas/estimativas. Projeto solicitado ausente ou inacessível responde genericamente “Projeto não encontrado”.

## Exemplo

```json
{
  "date": "2026-10-09",
  "timeZone": "America/Sao_Paulo",
  "includeArchived": true
}
```

Use apenas para leitura e comparação manual com a planilha; não representa importação ou conciliação persistida.

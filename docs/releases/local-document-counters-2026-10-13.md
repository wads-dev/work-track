# Histórico de uso de documentos no navegador

Três valores numéricos cumulativos em localStorage, independentes da flag de console e do ring de1000eventos:

- work-track:firestore:local-doc-reads: soma dos documentos retornados por getDocsFromCache (cache.result); releituras somam novamente. Não soma cache.filtered, renders, memória dos repositórios nem listener cache-only novamente.
- work-track:firestore:remote-doc-reads: documentos observados como added/modified em snapshots source remote sem hasPendingWrites, mais documentos existentes retornados por consultas explicitamente de servidor e leituras transacionais. Confirmação metadata-only não soma o tamanho total do snapshot; removidos não somam. Leitura transacional repetida após conflito soma novamente documentos retornados.
- work-track:firestore:doc-writes: chamadas set/update/delete aceitas no último attempt confirmado de transações Web e deleteDoc confirmado. Inclui documentos de auditoria; preview/noop tem0. Attempts abortados e commit rejeitado não somam. Idempotent replay sem writes tem0. Nenhum dado de documento/token é armazenado nos contadores.

F5/reabertura não zera; o histórico começa nesta implantação e vale para esta origem/perfil do navegador (não entre dispositivos). Logout não apaga os três totais do navegador. Limpar dados do site/removeItem os apaga. Valor corrompido/negativo é tratado como0; números saturam em MAX_SAFE_INTEGER.

Web Locks serializa read-modify-write entre abas quando disponível (Chrome/Edge/Firefox/Safari atuais em origem segura). Fallback sem Web Locks preserva cumulatividade de uma aba, mas não promete atomicidade entre abas simultâneas. Persistência bloqueada/quota não derruba o app e read() retorna null quando acesso não disponível.

## Sem envio remoto

Não existe envio/período de telemetria, coleção Firestore de uso, nova Function ou alteração de Rules. Nenhum custo de rede adicional gerado por esses contadores. O repositório FinanceControl foi inspecionado apenas como referência de ideia, não copiado nem alterado.

## Como consultar

No console do Work Track, com ou sem debug ligado:

Não é necessário ativar os logs. Rode:

```js
await window.__workTrackFirestoreMetrics.flush();
console.table(window.__workTrackFirestoreMetrics.read());
```

Ou os três valores diretamente:

```js
console.table({
  localReads: Number(
    localStorage.getItem('work-track:firestore:local-doc-reads') || 0,
  ),
  remoteReads: Number(
    localStorage.getItem('work-track:firestore:remote-doc-reads') || 0,
  ),
  writes: Number(localStorage.getItem('work-track:firestore:doc-writes') || 0),
});
```

window.__workTrackFirestoreDebug.clear() limpa somente o diagnóstico da página, não esses totais. As chaves não dependem de console.log ativado.

## Não confundir com billing ou documentos únicos

Contam operações observadas pela camada Web, não identidades únicas, accesses internos de índice nem contabilidade Firebase. Snapshot fromCache:false é semântica de sincronização SDK, não prova pacote de documento pela rede: views multitab já sincronizadas e ecos confirmados podem incluir added/modified a partir da persistência. Esse contador é nomeado observado remoto e NÃO prova documentos baixados/billed; warm metadata-only confirmations são0. Rules dependent reads, minimum-query charges, index-entry reads, backend/MCP e outras origens/dispositivos não entram. Histórico de antes da implantação não pode ser reconstruído honestamente.

## Validação

Check completo:987testes (155core+31data+335backend+447frontend+19tooling), lint/types/build. Integração de métricas com commit/retry/preview/commit negado validada com SDK mock, sem escrever dados produção. Browser localhost autenticado e real SDK Firebase produção: flag debug ausente,3chaves numéricas,totais preservados após F5,localReads aumenta em leitura de cache e remoteReads inalterado em confirmação metadata-only. Duas abas consultam mesmo total e Web Locks ativo; teste de módulos independentes garante não perder incrementos simultâneos. Navegação de período permanece em memória e não fabrica reads de Firestore. Nenhum envio remoto/Rules/Function adicionado.

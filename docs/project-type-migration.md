# Tipo explícito de projeto

Todos os projetos exigem `type: "work"` ou `type: "personal"`. Confidencialidade permanece apresentação, independente do escopo.

## Ordem de publicação

1. Autenticar Admin SDK com credenciais administrativas aprovadas (ADC).
2. Executar `node scripts/backfill-project-type.mjs --project wadsworktrack` para prévia completa paginada.
3. Revisar contagens. Valores explícitos inválidos exigem revisão, nunca são convertidos automaticamente.
4. Executar `node scripts/backfill-project-type.mjs --project wadsworktrack --apply --backup .release/project-type-before.ndjson`. O arquivo deve ser novo e privado, não versionado.
5. Repetir a prévia e exigir `missing: 0` e `invalid: 0` antes de publicar leitores/regras estritos.
6. Publicar o código e Rules somente após a confirmação da migração. Os três workflows de deploy executam `--verify` e recusam publicação enquanto houver tipo ausente ou inválido (leitura Admin via identidade federada, sem escrita).

A migração escreve apenas `type: "work"` em documentos de `projects` que não possuem esse campo, incluindo arquivados e mesclados. Não modifica projetos pessoais, confidencialidade, tópicos, apontamentos nem auditorias. Cada escrita exige precondição `lastUpdateTime`; conflito ou falha de backup aborta, sem sobrescrever alterações concorrentes. Uma execução interrompida pode ser retomada com outro arquivo de backup; documentos já classificados são ignorados.

O backup NDJSON possui cabeçalho do ambiente e, por documento, um payload base64 serializado via `node:v8` com path, updateTime e campos protobuf Firestore (preserva bytes e representações). Proteja o arquivo: contém dados de projetos. Não aplique restauração automática que remova classificações ou sobrescreva edições posteriores.

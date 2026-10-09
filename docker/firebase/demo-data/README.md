# Fixture Firebase sintética — apenas emuladores

Export nativo Firebase CLI 15.33.0 / Firestore Standard 1.22.0, projeto `demo-work-track`. Gerado em instâncias novas isoladas, nunca por export do ambiente corrente. Nenhum cliente OAuth, flow, código, token, senha, hash ou credencial Google/produção.

## Conteúdo

7 projetos (ativos, pessoal, confidencial e arquivado), 44 registros (40 pessoa principal/4 colega), 5 auditorias e 2 registros abertos. Datas fixas 1–9 outubro 2026 America/Sao_Paulo: curtos, sobrepostos e virada de dia. Raízes Firestore exclusivamente projects/users. Confidencialidade é apresentação, não autorização; propriedade continua regida pelas regras da aplicação.

Auth sintético Google emulado, verified, sem senhas:

- UID `35DvlWmc9p9KBKl6KD6i41aVGHPT`, `frontend.review@wads.dev`.
- UID `design-demo-colleague`, `demo.colleague@wads.dev`.

São identidades fictícias para login do emulador; não são contas Google reais. Auditorias pertencem à pessoa principal.

## Regeneração reproduzível

Na raiz do checkout, com backend compilado (`npm run build --workspace @work-track/backend`) e imagem Docker local `pointcontextsaver-firebase:latest`:

```sh
node --test scripts/demo-generator.test.mjs
sh scripts/demo-native.sh export --confirm-synthetic-export
sh scripts/demo-native.sh verify
```

O helper produz JSON determinístico em memória, envia pelo stdin para um container novo sem publicar portas, com scripts somente leitura. O container inicia apenas Auth/Firestore de `demo-work-track`, cria somente dados allowlisted e exporta nativamente. Não lê nenhum emulador corrente ou arquivo de credenciais. A operação export substitui apenas `docker/firebase/demo-data` para regenerar a fixture; não usar para dados particulares. Verify monta a fixture somente leitura e importa em outro container fresco e verifica payload exato de cada documento, árvore recursiva completa (incluindo subcoleções e documentos-pai ausentes), 56 referências e os dois usuários sem campos de senha/token. Ambos removem seu container ao terminar.

O Docker da aplicação importa esta fixture na primeira execução sem export privado; após isso, o export privado tem precedência. O marcador `firebase-export-metadata.json` e os diretórios `auth_export`/`firestore_export` são o formato nativo Firebase CLI. Nunca copiar o export corrente misturado com OAuth para aqui.

Verificado: export nativo e import novo com todos os payloads e contagens exatos; nenhum emulador visual corrente reiniciado.

# Emuladores Firebase com Docker Compose

Ambiente local isolado inspirado no Compose/Dockerfile do Golden Unicorn. Usa Node 22, Java 21 e Firebase CLI 15.33.0. O projeto é **demo-work-track**, sem login Firebase e sem acesso intencional ao projeto de produção.

## Validar sem iniciar serviços

```sh
docker compose config --quiet
sh -n docker/firebase/start-emulators.sh
```

## Iniciar (somente quando autorizado)

```sh
docker compose up --build
# Em outro terminal, encerrar graciosamente e exportar dados:
docker compose stop
# Remover containers preservando volumes/dados:
docker compose down
```

O primeiro build instala o Firebase CLI na imagem. Na inicialização, o container copia fontes/configs montadas read-only para seu workspace privado, executa npm ci sem hooks, compila backend/frontend e baixa os binários dos emuladores quando necessário. Downloads exigem rede; nenhuma instalação ou compilação modifica o checkout host. Não há watcher: reinicie o serviço para copiar novamente fontes/configs alteradas.

| Serviço     | URL local                                                    |
| ----------- | ------------------------------------------------------------ |
| Hosting     | http://127.0.0.1:5000                                        |
| Emulator UI | http://127.0.0.1:4001                                        |
| Auth        | http://127.0.0.1:9099                                        |
| Firestore   | http://127.0.0.1:8081                                        |
| Functions   | http://127.0.0.1:5001/demo-work-track/southamerica-east1/api |

Dentro do container os serviços escutam 0.0.0.0 para permitir o encaminhamento Docker. **No host, todas as portas publicadas usam 127.0.0.1.** Hub/logging ficam internos, sem publicação. Não use proxies/túneis públicos: emuladores e sua UI não são serviços de produção autenticados.

A porta da UI no host é configurável: `FIREBASE_UI_PORT=4010 docker compose up --build`. O padrão 4001 evita disputar a porta 4000 usada por outros projetos. A porta interna permanece 4000; nenhum outro serviço muda de porta.

## Dados e isolamento

- Volumes separados preservam dependências root/backend/frontend, cache de npm/emuladores e dados em /data.
- Na primeira inicialização, sem export local, o container importa a fixture sintética versionável em `docker/firebase/demo-data/` (Auth e Firestore). Ela não contém dados de produção nem sessões OAuth.
- O export automático ocorre no encerramento gracioso e é salvo somente no volume privado `/data`, nunca sobre a fixture do repositório. Nas próximas inicializações esse export local tem prioridade, preservando suas alterações. Evite kill forçado, que pode impedir exportação.
- docker compose down preserva volumes. **docker compose down --volumes apaga dependências, cache e dados locais definitivamente**; só execute quando quiser explicitamente esse reset.
- Apenas fontes/configs específicas são montadas. Não montamos .env, .firebaserc, credenciais Google, HOME host, socket Docker nem o checkout inteiro.
- Não altere o project demo-work-track para um ID real, não forneça credenciais e não execute deploy neste container.
- Firebase Admin nas Functions é direcionado pelos hosts definidos pelo Emulator Suite; recursos não emulados em projetos demo devem falhar em vez de acessar serviços reais. Chamadas HTTP externas arbitrárias feitas pelo código não são bloqueadas por Docker: isolamento demo não equivale a firewall.

## Massa demonstrativa reproduzível

A fixture contém projetos ativos, arquivados, confidenciais e pessoais; registros curtos, fechados e abertos; intervalos sobrepostos e atravessando meia-noite; tópicos e exemplos de auditoria. As datas são fixas em outubro de 2026, para comparações visuais reproduzíveis. Abra o calendário na semana de 8 de outubro de 2026 para ver os cenários. O segundo participante é apenas sintético, não um usuário de produção.

O gerador `scripts/design-demo.mjs` é a fonte legível da massa: o modo padrão é dry-run sem rede, e a gravação exige `--write --confirm-local-demo`. Ele aceita apenas o emulador local `demo-work-track`, usa IDs estáveis e não sobrescreve documentos existentes. A fixture nativa permite restaurar tanto Auth quanto Firestore sem passos manuais após clonar.

Não versione um export bruto de sessões reais de desenvolvimento: o volume local pode incluir dados alterados e fluxos OAuth temporários. Atualizações da fixture devem partir do gerador sintético em um emulador limpo e isolado. Não use exports de produção nem copie credenciais.

## Dashboard e OAuth: limites atuais

O frontend conecta explicitamente Auth e Firestore aos emuladores quando a configuração usa projectId demo-work-track e o hostname é localhost ou 127.0.0.1. Usa portas 9099 e 8081. Projeto demo em outro hostname falha fechado. Startup Docker verificado: os emuladores iniciaram, e o Hosting retornou configuração demo-work-track. Confirme o bootstrap demo antes de autenticar. Não teste com configuração de produção nem suponha que /__/firebase/init.json configure os conectores. No telefone/outro host, os endereços precisariam de adaptação deliberada; as portas loopback não oferecem acesso remoto.

As regras permitem leitura de projetos e registros corporativos para token Google com email verificado @wads.dev; auditoria de registros somente para o dono. Use identidades de teste compatíveis no Auth Emulator; não enfraqueça regras para testar o dashboard. O fluxo Google local é simulado pelo emulador, não um login de produção.

O backend OAuth ainda fixa issuer/resource/login de produção em seu bootstrap. Este Compose não modifica esse contrato: endpoints podem responder localmente, mas o fluxo OAuth browser completo não é um fluxo demo pronto e pode gerar redirects de produção. Não siga esses redirects para testar isolamento. Ajustar issuer/resource por ambiente requer uma tarefa separada com testes.

## Validação realizada e pendências

Com autorização do usuário, a imagem foi construída e os emuladores iniciados. Foram verificados bootstrap demo, relatórios via SDK e revisão visual desktop/mobile com dados sintéticos locais. A porta Firestore foi alterada para 8081 e respondeu ao teste HTTP. Não foi utilizado login de produção na revisão local.

A fixture nativa foi exportada e importada em containers novos isolados; a comparação recursiva confirmou os 56 documentos exatos (7 projetos, 44 registros, 5 auditorias) e os 2 usuários Google sintéticos, sem coleções OAuth ou credenciais. O modo de verificação também passou com o snapshot montado somente leitura. O Hosting e a Emulator UI nas portas 5000 e 4001 responderam após a importação inicial. O ciclo automático de persistência também foi verificado isoladamente, sem reiniciar o preview: um primeiro container importou a fixture e exportou ao receber SIGTERM; um segundo container novo importou esse volume privado (somente leitura na verificação), mantendo exatamente os mesmos 56 documentos e 2 usuários. O script dá precedência ao snapshot privado em `/data` sobre a fixture versionada. Testes adversariais completos das regras permanecem pendentes.

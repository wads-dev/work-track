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
| Emulator UI | http://127.0.0.1:4000                                        |
| Auth        | http://127.0.0.1:9099                                        |
| Firestore   | http://127.0.0.1:8081                                        |
| Functions   | http://127.0.0.1:5001/demo-work-track/southamerica-east1/api |

Dentro do container os serviços escutam 0.0.0.0 para permitir o encaminhamento Docker. **No host, todas as portas publicadas usam 127.0.0.1.** Hub/logging ficam internos, sem publicação. Não use proxies/túneis públicos: emuladores e sua UI não são serviços de produção autenticados.

## Dados e isolamento

- Volumes separados preservam dependências root/backend/frontend, cache de npm/emuladores e dados em /data.
- O export automático ocorre no encerramento gracioso; um export existente é importado na próxima inicialização. Evite kill forçado, que pode impedir exportação.
- docker compose down preserva volumes. **docker compose down --volumes apaga dependências, cache e dados locais definitivamente**; só execute quando quiser explicitamente esse reset.
- Apenas fontes/configs específicas são montadas. Não montamos .env, .firebaserc, credenciais Google, HOME host, socket Docker nem o checkout inteiro.
- Não altere o project demo-work-track para um ID real, não forneça credenciais e não execute deploy neste container.
- Firebase Admin nas Functions é direcionado pelos hosts definidos pelo Emulator Suite; recursos não emulados em projetos demo devem falhar em vez de acessar serviços reais. Chamadas HTTP externas arbitrárias feitas pelo código não são bloqueadas por Docker: isolamento demo não equivale a firewall.

## Dashboard e OAuth: limites atuais

O frontend conecta explicitamente Auth e Firestore aos emuladores quando a configuração usa projectId demo-work-track e o hostname é localhost ou 127.0.0.1. Usa portas 9099 e 8081. Projeto demo em outro hostname falha fechado. O startup Docker ainda não foi testado; confirme que o Hosting Emulator fornece configuração demo válida antes de autenticar. Não teste com configuração de produção nem suponha que /__/firebase/init.json configure os conectores. No telefone/outro host, os endereços precisariam de adaptação deliberada; as portas loopback não oferecem acesso remoto.

As regras permitem projetos somente para token Google com email verificado @wads.dev e registros apenas para o UID do caminho. Use identidades de teste compatíveis no Auth Emulator; não enfraqueça regras para testar o dashboard. O fluxo Google local é simulado pelo emulador, não um login de produção.

O backend OAuth ainda fixa issuer/resource/login de produção em seu bootstrap. Este Compose não modifica esse contrato: endpoints podem responder localmente, mas o fluxo OAuth browser completo não é um fluxo demo pronto e pode gerar redirects de produção. Não siga esses redirects para testar isolamento. Ajustar issuer/resource por ambiente requer uma tarefa separada com testes.

## Validação realizada e pendências

Nesta entrega, apenas docker compose config, sintaxe sh e validações estáticas são executadas. Nenhum build de imagem, container ou servidor foi iniciado. Config válida não prova startup/runtime, compilação das regras, login Google, export/import ou integração SDK: validar esses itens posteriormente, com autorização para executar o ambiente.

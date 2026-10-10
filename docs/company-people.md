# Diretório corporativo de pessoas

A rota /people é uma consulta somente leitura ao Firebase Authentication, via callable listCompanyPeople na região southamerica-east1. Não consulta projetos ou registros para determinar quem pertence à empresa: inclui contas elegíveis sem qualquer atividade registrada.

## Escopo e segurança

A empresa é definida pela política de autenticação já existente: e-mail @wads.dev verificado e provedor Google. A listagem também exclui usuários desativados. A pessoa que consulta precisa passar por authorizeReport (conta Google corporativa verificada). Não há lista de outras empresas nem enumeração pública.

A resposta contém somente uid, displayName, email e photoURL. Nome/foto ausentes são null. Senhas, hashes, salts, custom claims e metadata não são retornados. Erros do Firebase Admin são sanitizados. A callable não faz parte do catálogo MCP.

## Contrato

Entrada: { pageSize?: number, pageToken?: string }. pageSize deve ser inteiro de 1 a 100, padrão 100. pageToken é opcional, não vazio, máximo 2048 caracteres. Campos desconhecidos são rejeitados.

Saída: { people: Array<{ uid: string, displayName: string | null, email: string, photoURL: string | null }>, nextPageToken: string | null }.

Cada chamada lê uma página Firebase Auth, filtrada depois da leitura. Uma página vazia pode conter nextPageToken: continue até null. O cliente deduplica por uid, ordena por nome/e-mail, rejeita cursores repetidos e só publica a lista completa. Cancelamento de navegação/troca de conta impede publicação de resultados anteriores.

## Interface

Provider autenticado em memória, isolado por uid; sem persistência em localStorage. Reutilizado pela aba Pessoas, cabeçalho do perfil e rótulos/seletor do Calendário. O diretório não concede acesso a registros de terceiros: as regras existentes continuam aplicáveis. A aba oferece busca por nome/e-mail/ID, atualização, estados de carregamento/erro/vazio e avatar substituto. O modo de privacidade oculta os dados. Fotos aceitam somente HTTPS, usam referrerPolicy no-referrer e fallback em caso de erro.

## Identidade reutilizável e Calendário

PersonIdentity recebe apenas uid e resolve nome/foto pelo provider global, carregado uma vez após login e mantido entre rotas. Não há consultas de perfil por linha. label opcional permite manter “Meu calendário” com a foto própria. Ausência de foto usa iniciais; ausência de conta usa rótulo neutro, nunca UID bruto ou “Você”. Nome ausente usa e-mail. Imagens são decorativas ao lado do nome, HTTPS e sem referrer.

Dashboard/gráficos (eixo, tooltip e legenda), relatórios de projeto/tópico, perfil, tabela de participantes e eventos/filtro do Calendário usam essa identidade. Dados mascarados não enviam UID ao gráfico/componente e não revelam fotos.

“Todas as pessoas” não tem teto de quantidade de participantes: foram removidos os limites de dez selecionados e de cem participantes do diretório do relatório. Mantêm-se limites de documentos/bytes e duração de leitura para segurança; excesso resulta em erro explícito, nunca truncamento silencioso. O diretório Firebase permanece paginado, sem limite total de pessoas.

## Publicação e validação

Publicar backend e frontend juntos pelo fluxo normal do repositório: a nova callable precisa estar disponível para carregar o diretório. Não há migração Firestore ou alteração de Rules. Em desenvolvimento, use Firebase Auth emulator com contas Google corporativas verificadas; usuários externos e desativados não devem aparecer.

Validação automatizada: npm run check (Prettier, ESLint, TypeScript, testes backend/frontend/demo e builds). Testes cobrem autorização, validação estrita, minimização de dados, filtros corporativos, paginação vazia, nomes/fotos ausentes, erros e cancelamento.

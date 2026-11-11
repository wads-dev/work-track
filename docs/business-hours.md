# Horas úteis por projeto

- Na edição do projeto, cadastre períodos de contratação com início e fim inclusivos. Fim vazio mantém a vigência; períodos não podem sobrepor. Carga diária de 0 a 24 horas, do projeto inteiro. Sem períodos, acompanhamento desativado.
- O menu Feriados mantém calendário compartilhado, com data completa `YYYY-MM-DD` e campo `type`: `every_year_same_date` ou `specific_date`. Ex.: `{date:"2026-12-25",name:"Natal",type:"every_year_same_date"}`. A interface mantém o seletor nativo de data; trocar o tipo não altera a data. `every_year_same_date` ignora o ano no cálculo; `specific_date` mantém ocorrência específica. Itens antigos sem `type` continuam específicos; preserve essa ausência no `expectedHolidays`. 29/02 anual só vale em anos bissextos. Uma ocorrência específica coincidente com um anual não desconta o dia duas vezes. O campo opcional `scope` aceita `federal`, `state` ou `municipal`, somente como metadado de abrangência: não filtra por localização nem altera cálculos. Sábado e domingo sempre têm meta zero. Não há importação automática de feriados nacionais/locais.
- A meta mensal soma a carga contratada de cada dia útil. A meta acumulada inclui hoje inteiro desde meia-noite em America/Sao_Paulo.
- Visão geral exibe o mês atual; Histórico exibe meses desde o primeiro registro até o atual, incluindo meses vazios. Entregas usam o rateio, multiplicador e estimativas existentes, com recorte nos limites reais de cada mês.
- A barra de fundo indica a meta acumulada; a barra interna é a entrega. Divisões por pessoa exibem nome, horas e percentual relativo à meta mensal. Textos preservam valores acima de 100%. Meta zero não gera divisão por zero.
- Na régua do calendário, projetos com contrato vigente têm barra diária na cor do projeto. Dia sem meta com entrega usa barra hachurada e identificação de horas extras.
- MCP: get_business_hours({projectId}), update_business_hours({projectId,businessHours,expectedBusinessHours,requestId,reason}), get_holidays({}), update_holidays({holidays,expectedHolidays,requestId,reason}). Leia antes de editar; use o valor esperado retornado e mantenha requestId em retries. Datas YYYY-MM-DD, horasPerDay numérico; endDate null.
- Alterações são auditadas e verificam concorrência. ACLs pessoais/corporativas e apresentação confidencial permanecem preservadas. Feriados são compartilhados; MCP escreve no backend existente e a interface Web usa transação Firestore autenticada corporativa, com auditoria obrigatória nas Rules. Não existe callable específica de feriados. Consultas Web usam cache persistente alimentado pela sincronização global, sem listeners por navegação.
- Configuração histórica é recalculável: editar contratos/feriados antigos altera metas passadas, não fatos dos registros.

## Futuro — calendário por localização do projeto (não implementado)

- TODO: permitir identificar o estado e o município de cada feriado estadual/municipal, além do `scope` informativo.
- TODO: permitir configurar o estado e o município de referência em cada projeto, conforme o calendário contratualmente aplicável ao cliente — não inferir pela residência do usuário.
- TODO: resolver o calendário aplicável ao projeto combinando feriados federais com os estaduais e municipais daquela localização. Exemplo: cliente de Curitiba/PR pode seguir Curitiba e Paraná, em vez de São Paulo/SP.
- A regra de escolha, eventuais exceções contratuais e compatibilidade dos registros atuais deverão ser definidas antes da implementação. Hoje `scope` continua apenas informativo e o calendário é compartilhado; nenhuma filtragem por localização foi adicionada.

## Ambiente desta implementação

Por solicitação expressa, desenvolvimento na pasta principal e branch main, com Compose padrão (frontend 5173, Auth 9099, Firestore 8081, Functions 5001 e UI 4001). Somente demo-work-track e dados sintéticos. Frontend com HMR; Functions/Rules exigem recriação do serviço firebase usando a imagem existente. Containers permanecem disponíveis para revisão.

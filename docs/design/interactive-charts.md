# Gráficos interativos

Recharts substitui as pizzas SVG e barras manuais nos relatórios pessoal, corporativo, de projeto e de assuntos. O componente InteractiveChart filtra somente valores positivos finitos, mantém identidade explícita e exibe nome completo, horas e percentual da distribuição em tooltip. Percentuais descrevem a distribuição selecionada, não horas líquidas nem redistribuição de assuntos. Animações desativadas e links/botões na legenda fornecem alternativas de teclado.

Clique navega ao projeto, assunto ou perfil quando há identidade e metadados autorizados. Categorias ocultas não expõem navegação; assuntos sem destino selecionam o bucket. Pessoas de assuntos usam uid explícito opcional, nunca índices como identidade.

A rota /people/:personId fixa a seleção de pessoa e reutiliza getCalendarReport. O UID do visualizador continua vindo da autenticação. Terceiros usam modo global e somente projetos corporativos; registros permanecem somente leitura. Não há nova API, regras ou acesso a registros privados.

Validação: npm run check (321 backend + 131 frontend + 4 demo); smoke no navegador com tooltip e clique reais em pizza/projetos e barras/assuntos, perfil corporativo de terceiro, UID fixo, seletor desabilitado, zero erros de console, sem overflow nas larguras 1440 e 390. Build emite avisos não bloqueantes existentes de Radix e tamanho do bundle.

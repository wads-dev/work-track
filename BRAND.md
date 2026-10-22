# WorkTrack — identidade visual

**Conversa que registra o percurso do trabalho.**

## Conceito

O balão branco com ponteiros representa conversar com o assistente MCP para registrar tempo e contexto de trabalho. O documento coral, com duas linhas e sobreposição ao balão, representa o registro organizado resultante. O corte diagonal na cauda e a ponta coral separada são a chegada do percurso; não substituir por círculo solto nem acrescentar um ponto no topo. O WorkTrack organiza horas/projetos e seus dados alimentam o Client Experience, sendo o segundo app mais importante da família. O conceito não é apenas um cronômetro.

## Fontes aprovadas neste projeto

- [Ícone canônico](apps/frontend/public/brand.svg).
- [Background](assets/app-icon/apple/background.svg).
- [Foreground branco](assets/app-icon/apple/01-white.svg).
- [Foreground de acento](assets/app-icon/apple/02-accent.svg).
- [Composição plana full-bleed](assets/app-icon/master/composite.svg).

## Família Wads.dev

Identidade aprovada em 22/10/2026. Cada app tem cor própria, mas compartilha a mesma geometria de fundo e assinatura Wads branca a 9% de opacidade: Client Experience roxo (#782F9A), Android2Mac laranja (#F04F30), WorkTrack verde-petróleo (#0D5963). Não uniformizar os pequenos desvios das cores originais do pingo: eles fazem parte da arte aprovada.

O desenho é encorpado e orgânico, como um gesto cursivo de mão firme: curvas contínuas, variação controlada de espessura e terminações suaves. Não imitar a marca com tremores, ondulações artificiais, fonte aproximada ou ícones de biblioteca. A assinatura de fundo é a Wads original, não o símbolo institucional com crina e estrelas.

## Camadas e composição

- A fonte aprovada mantém a placa arredondada da apresentação. Não redesenhar nem alterar suas proporções.
- Em master/ e apple/, background.svg é full-bleed e contém a assinatura a 9%; o sistema aplica a máscara externa.
- Apple: sobrepor background.svg, 01-white.svg e 02-accent.svg, nesta ordem, no mesmo canvas 1024 × 1024. As duas últimas são as duas camadas de foreground. Não recortar margens, reposicionar nem aplicar escalas independentes.
- foreground.svg combina as duas camadas e composite.svg combina tudo. São alternativas de consulta/fallback; não importar junto das camadas separadas para evitar duplicação.
- 00-signature.svg é uma alternativa apenas para fundo nativo do Icon Composer: usar a cor nativa + esta assinatura (já a 9%) em vez de background.svg, nunca junto dele. Não reaplicar 9% à camada: isso reduziria a assinatura duas vezes.
- As camadas Android usam redução uniforme para a área segura do launcher e fundo full-bleed. Não importar o composite arredondado como foreground adaptive.
- Manter recortes, transparências, fill-rule, máscaras e transformações. Máscaras pretas/brancas são dados de transparência, não cores da marca. Usar IDs únicos se inserir várias cópias inline no mesmo documento.
- Efeitos Liquid Glass são responsabilidade do sistema/Composer. SVGs e PNGs planos não comprovam aparência nativa. Revisar normal, escuro, temático, Clear/Tinted e máscaras reais antes de publicar.

## Uso e manutenção

Escalar uniformemente. Não adicionar sombras, contornos, gradientes ou pingo extra. Em 32 px os detalhes pequenos perdem leitura; isso não autoriza simplificações automáticas. Alterações de geometria exigem aprovação. Manter os três apps juntos nas próximas comparações.

O exportador scripts/generate-brand-layers.py lê assets/brand-config.json e a fonte canônica do próprio repositório; não depende da pasta docs ou de históricos de propostas. Rodar com --check verifica as camadas sem gravá-las. Não editar derivados manualmente. Nenhum gerador publica, assina ou instala apps.

## Gerar e verificar

```sh
/usr/bin/python3 scripts/generate-brand-layers.py
/usr/bin/python3 scripts/generate-brand-icons.py
/usr/bin/python3 scripts/generate-brand-layers.py --check
```

O app atual é web/PWA. brand.svg é usado no favicon, login, navegação e offline; PNGs PWA, apple-touch-icon e favicon.ico são regenerados. As camadas Apple são fontes prontas para futura integração, não um app macOS/iOS compilado. O gerador de PNGs requer Swift/AppKit no macOS e ImageMagick 7.

import { Alert, Box, Paper, Typography } from '@mui/material';
export function RulesPage() {
  return (
    <Paper
      component="section"
      sx={{
        p: { xs: 2, sm: 3 },
        maxWidth: 920,
        mx: 'auto',
        '& h2': { mb: 2 },
        '& p': { lineHeight: 1.7 },
      }}
    >
      <Typography component="h2" variant="h5">
        Regras do relatório
      </Typography>
      <Box
        component="nav"
        aria-label="Sumário das regras"
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, my: 2, fontSize: 14 }}
      >
        <a href="#rules-policy">Estimativas e fatos</a>
        <a href="#rules-consent">Alterações</a>
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Fatos preservados · estimativas limitadas · orçamento global de 8h por
        pessoa/dia. Nenhum fim é persistido automaticamente.
      </Alert>
      <Typography id="rules-policy">
        Políticas v3: orçamento diário global de estimativas por pessoa,
        considerando todos os projetos e registros do contexto completo. Nenhum
        fato original é alterado.
      </Typography>
      <Box component="ol" sx={{ '& li': { my: 2 } }}>
        <li>
          Tempos com fim explícito são preservados, mesmo acima de 8 horas. Eles
          consomem a margem diária disponível para estimativas; não são
          truncados.
        </li>
        <li>
          O orçamento diário de 8 horas é global por pessoa/dia, não por projeto
          ou página. A margem restante é distribuída em ordem cronológica
          determinística de início e ID, nunca em partes iguais inventadas.
          Quando fatos já atingem 8 horas, não há margem para novas estimativas
          naquele dia.
        </li>
        <li>
          Registros abertos têm limite estimativo no menor entre agora, início +
          4 horas, meia-noite e próximo início conforme a política específica.
          Se não transcorreram 4 horas, não se atribuem 4 horas completas. Fins
          estimados nunca são persistidos.
        </li>
        <li>
          O servidor calcula estimativas com contexto global completo antes de
          selecionar a página exibida. Se o limite de segurança impedir
          completar o contexto, a consulta deve falhar: não são apresentados
          valores estimados como se fossem globais.
        </li>
        <li>
          Totais, gráficos e calendário mostram somente a página selecionada e o
          período consultado. Um contexto global de cálculo NÃO torna o total
          exibido um total global do histórico. Consulte indicação parcial,
          instante de referência e avisos.
        </li>
        <li>
          Atividades simultâneas podem ser somadas. Total agregado não significa
          horas líquidas únicas. Fatos com sobreposição permanecem intactos.
        </li>
        <li>
          Tópico único sem divisão recebe tempo integral; múltiplos sem divisão
          ficam em Não distribuído. Distribuições informadas são preservadas e
          divergências geram aviso. Pizza usa soma das próprias fatias.
        </li>
      </Box>
      <Typography component="h3" variant="h6">
        Relatório de projeto
      </Typography>
      <Typography>
        Política project-report-v3: orçamento global por pessoa/dia,
        considerando registros de todos os projetos. Próximo início da mesma
        pessoa somente no mesmo projeto é considerado, inclusive fora da página.
        Projetos diferentes nunca cortam a estimativa. Critérios de cálculo são
        consistentes entre consultas. O filtro por projeto afeta apenas dados
        exibidos, não cria orçamento adicional.
      </Typography>
      <Typography component="h3" variant="h6" sx={{ mt: 3 }}>
        Dashboard e calendário pessoais
      </Typography>
      <Typography>
        Política personal-v3: o orçamento global segue os mesmos critérios. O
        período selecionado afeta somente os dados exibidos. Próximo início da
        própria pessoa é considerado somente no mesmo projeto, inclusive fora da
        página selecionada; abertos também respeitam a virada de dia definida
        pelos critérios do orçamento. Intervalos são recortados apenas para
        visualização do período, sem mudar fatos.
      </Typography>
      <Typography sx={{ mt: 2 }}>
        Candidato ao próximo início com fim explícito e duração menor que 15
        minutos é ignorado como corte de estimativa, mas seu tempo factual
        continua consumindo o orçamento global. Exatamente 15 minutos já pode
        cortar; próximo registro aberto no mesmo projeto também pode cortar.
        Atividade em outro projeto nunca corta a estimativa.
      </Typography>
      <Alert id="rules-consent" severity="info" sx={{ mt: 2 }}>
        Editar fim ou reabrir registro exige ação e confirmação explícitas.
        Nenhuma política encerra atividades automaticamente.
      </Alert>
    </Paper>
  );
}

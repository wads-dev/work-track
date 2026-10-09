import { Alert, Box, Paper, Typography } from '@mui/material';
export function RulesPage() {
  return (
    <Paper component="section" sx={{ p: 3 }}>
      <Typography component="h2" variant="h5">
        Regras do relatório
      </Typography>
      <Typography>
        Política project-report-v1. Estimativas são somente apresentação; nenhum
        fato original é alterado.
      </Typography>
      <Box component="ol" sx={{ '& li': { my: 2 } }}>
        <li>
          Com fim explícito, o intervalo informado é preservado, mesmo acima de
          8 horas.
        </li>
        <li>
          Registro aberto termina estimativamente no menor entre agora, início +
          4 horas, meia-noite no fuso do registro e próximo início da mesma
          pessoa no mesmo projeto dentro da página consultada. Se ainda não
          transcorreram 4 horas, não se atribuem 4 horas completas.
        </li>
        <li>
          Orçamento de 8 horas de estimativa por pessoa/dia/projeto/página.
          Tempos fechados consomem esse orçamento, mas nunca são truncados. Não
          é um limite global do dia da pessoa.
        </li>
        <li>
          Atividades simultâneas podem ser somadas. O total agregado não é tempo
          líquido único. Sobreposições e ambiguidades são sinalizadas.
        </li>
        <li>
          Tópico único sem divisão recebe tempo integral; múltiplos sem divisão
          ficam no bucket Não distribuído. Distribuições informadas são
          preservadas; quando excedem total, há aviso. Pizza usa soma de suas
          próprias fatias, não percentual sobre total do projeto.
        </li>
        <li>
          Totais e gráficos representam somente a página carregada. Parcial,
          estimativas e instante de referência ficam indicados. Estimativas
          nunca encerram automaticamente registros.
        </li>
      </Box>
      <Alert severity="warning">
        A política atual considera próximo início no mesmo projeto, não entre
        projetos diferentes. Não há conciliação automática cross-project.
      </Alert>
      <Typography component="h3" variant="h6" sx={{ mt: 3 }}>
        Política pessoal personal-v1
      </Typography>
      <Typography>
        Dashboard e calendário pessoais consideram próximo início da mesma
        pessoa entre projetos na página carregada. O orçamento diário usa o fuso
        solicitado no filtro; abertos limitam-se também à meia-noite do registro
        e à meia-noite nesse fuso. Intervalos são recortados visualmente ao
        período solicitado, sem alterar fatos. Totais de páginas substituem
        dados, não representam todo o histórico; podem somar atividades
        simultâneas.
      </Typography>
    </Paper>
  );
}

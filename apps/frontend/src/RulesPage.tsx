import { Alert, AlertDescription } from './components/ui/alert';
export function RulesPage() {
  return (
    <section className="mx-auto max-w-[920px] rounded-xl border bg-card p-4 sm:p-6 [&_h2]:mb-4 [&_p]:leading-relaxed">
      <h2 className="text-2xl font-semibold">Regras do relatório</h2>
      <nav
        aria-label="Sumário das regras"
        className="my-4 flex flex-wrap gap-4 text-sm [&_a]:text-primary [&_a]:underline"
      >
        <a href="#rules-policy">Estimativas e fatos</a>
        <a href="#rules-consent">Alterações</a>
      </nav>
      <Alert className="mb-4">
        <AlertDescription>
          Fatos preservados · estimativas limitadas · orçamento global de 8h por
          pessoa/dia. Nenhum fim é persistido automaticamente.
        </AlertDescription>
      </Alert>
      <p id="rules-policy">
        Políticas v3: orçamento diário global de estimativas por pessoa,
        considerando todos os projetos e registros do contexto completo. Nenhum
        fato original é alterado.
      </p>
      <ol className="list-decimal pl-6 [&_li]:my-4">
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
      </ol>
      <h3 className="text-lg font-semibold">Relatório de projeto</h3>
      <p>
        Política project-report-v3: orçamento global por pessoa/dia,
        considerando registros de todos os projetos. Próximo início da mesma
        pessoa somente no mesmo projeto é considerado, inclusive fora da página.
        Projetos diferentes nunca cortam a estimativa. Critérios de cálculo são
        consistentes entre consultas. O filtro por projeto afeta apenas dados
        exibidos, não cria orçamento adicional.
      </p>
      <h3 className="mt-6 text-lg font-semibold">
        Dashboard e calendário pessoais
      </h3>
      <p>
        Política personal-v3: o orçamento global segue os mesmos critérios. O
        período selecionado afeta somente os dados exibidos. Próximo início da
        própria pessoa é considerado somente no mesmo projeto, inclusive fora da
        página selecionada; abertos também respeitam a virada de dia definida
        pelos critérios do orçamento. Intervalos são recortados apenas para
        visualização do período, sem mudar fatos.
      </p>
      <p className="mt-4">
        Candidato ao próximo início com fim explícito e duração menor que 15
        minutos é ignorado como corte de estimativa, mas seu tempo factual
        continua consumindo o orçamento global. Exatamente 15 minutos já pode
        cortar; próximo registro aberto no mesmo projeto também pode cortar.
        Atividade em outro projeto nunca corta a estimativa.
      </p>
      <Alert id="rules-consent" className="mt-4">
        <AlertDescription>
          Editar fim ou reabrir registro exige ação e confirmação explícitas.
          Nenhuma política encerra atividades automaticamente.
        </AlertDescription>
      </Alert>
    </section>
  );
}

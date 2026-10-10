import { Alert, AlertDescription } from '../../components/ui/alert';
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
          Fatos preservados · até 6h estimadas por registro aberto · sem teto
          diário. Nenhum fim é persistido automaticamente.
        </AlertDescription>
      </Alert>
      <p id="rules-policy">
        Estimativas são calculadas com contexto completo. Nenhum fato original é
        alterado.
      </p>
      <ol className="list-decimal pl-6 [&_li]:my-4">
        <li>
          Tempos com fim explícito são preservados integralmente, sem
          truncamento e sem consumir saldo para outras atividades.
        </li>
        <li>
          Não há teto diário de horas. Registros simultâneos de projetos
          diferentes não reduzem a estimativa uns dos outros.
        </li>
        <li>
          Registros abertos têm fim estimado no menor entre agora, início + 6
          horas, meia-noite no fuso do registro e America/Sao_Paulo, e próximo
          início da mesma pessoa no mesmo projeto. Se não transcorreram 6 horas,
          não se atribuem 6 horas completas. Fins estimados nunca são
          persistidos.
        </li>
        <li>
          Um próximo registro encerrado com menos de 15 minutos não corta a
          estimativa. Exatamente 15 minutos já pode cortar; um próximo registro
          aberto também pode cortar. Outros projetos e outras pessoas nunca
          cortam.
        </li>
        <li>
          O contexto completo é carregado antes dos filtros e páginas. Se os
          limites de segurança impedirem completar o contexto, a consulta falha
          em vez de apresentar estimativas incompletas.
        </li>
        <li>
          Totais respeitam o período e a seleção consultados. Consulte a
          indicação de página parcial, o instante de referência e os avisos.
        </li>
        <li>
          Atividades simultâneas são somadas. O total agregado não representa
          tempo ocupado único. Interrupções não são descontadas automaticamente.
        </li>
        <li>
          Registros abertos sem duração estimada aparecem na lista e como
          marcadores de início no calendário. Não somam horas e não representam
          encerramento real.
        </li>
        <li>
          Tópico único sem divisão recebe tempo integral; múltiplos sem divisão
          ficam em Não distribuído. Distribuições informadas são preservadas e
          divergências geram aviso.
        </li>
      </ol>
      <h3 className="text-lg font-semibold">Calendário e relatórios</h3>
      <p>
        Relatórios de projeto, pessoais, corporativos e consulta de horas usam
        os mesmos limites individuais de estimativa. Filtros afetam a seleção
        exibida, não alteram fatos nem criam tempo adicional.
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

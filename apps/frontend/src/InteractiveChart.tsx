import { useNavigate, Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { hours, colors } from './report-chart';
export type ChartDatum = {
  key: string;
  label: string;
  minutes: number;
  href?: string;
  onSelect?: () => void;
};
export function InteractiveChart({
  title,
  data,
  variant = 'bar',
}: {
  title: string;
  data: ChartDatum[];
  variant?: 'pie' | 'bar';
}) {
  const navigate = useNavigate();
  const values = data.filter(
    (item) => Number.isFinite(item.minutes) && item.minutes > 0,
  );
  const activate = (item: ChartDatum) => {
    if (item.href) navigate(item.href);
    else item.onSelect?.();
  };
  const total = values.reduce((sum, item) => sum + item.minutes, 0);
  if (!values.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum tempo disponível nesta seleção.
      </p>
    );
  const tooltip = (
    <Tooltip
      content={({ active, payload }) => {
        const item = payload?.[0]?.payload as ChartDatum | undefined;
        return active && item ? (
          <div className="rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md">
            <p className="font-medium">{item.label}</p>
            <p>
              {hours(item.minutes)} ·{' '}
              {new Intl.NumberFormat('pt-BR', {
                style: 'percent',
                maximumFractionDigits: 1,
              }).format(item.minutes / total)}{' '}
              da distribuição
            </p>
            {(item.href || item.onSelect) && (
              <p className="text-xs text-muted-foreground">
                Clique para ver detalhes
              </p>
            )}
          </div>
        ) : null;
      }}
    />
  );
  return (
    <section aria-label={title} className="min-w-0">
      <div
        className="my-4 w-full"
        style={{
          height:
            variant === 'pie'
              ? 260
              : Math.max(180, Math.min(values.length * 42 + 40, 480)),
        }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {variant === 'pie' ? (
            <PieChart accessibilityLayer>
              {tooltip}
              <Pie
                data={values}
                dataKey="minutes"
                nameKey="label"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={2}
                isAnimationActive={false}
                onClick={(item) => activate(item as unknown as ChartDatum)}
              >
                {values.map((item, index) => (
                  <Cell
                    key={item.key}
                    fill={colors[index % colors.length]}
                    cursor={item.href || item.onSelect ? 'pointer' : 'default'}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart
              data={values}
              layout="vertical"
              accessibilityLayer
              margin={{ left: 0, right: 24, top: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                tickFormatter={hours}
                stroke="var(--muted-foreground)"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickFormatter={(label: string) =>
                  label.length > 18 ? label.slice(0, 17) + '…' : label
                }
              />
              {tooltip}
              <Bar
                dataKey="minutes"
                name="Tempo"
                isAnimationActive={false}
                radius={[0, 4, 4, 0]}
                onClick={(item) => activate(item as unknown as ChartDatum)}
              >
                {values.map((item, index) => (
                  <Cell
                    key={item.key}
                    fill={colors[index % colors.length]}
                    cursor={item.href || item.onSelect ? 'pointer' : 'default'}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <ul
        className="space-y-1 text-sm"
        aria-label={title + ' — valores e navegação'}
      >
        {values.map((item) => (
          <li key={item.key}>
            {item.href ? (
              <Link
                className="text-primary underline underline-offset-4 focus-visible:outline-2"
                to={item.href}
              >
                {item.label}: {hours(item.minutes)}
              </Link>
            ) : item.onSelect ? (
              <button
                type="button"
                className="text-primary underline underline-offset-4 focus-visible:outline-2"
                onClick={() => activate(item)}
              >
                {item.label}: {hours(item.minutes)}
              </button>
            ) : (
              <span>
                {item.label}: {hours(item.minutes)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

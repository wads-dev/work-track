export type Bucket = { label: string; minutes: number };
const colors = [
  '#2457a7',
  '#a84417',
  '#35704a',
  '#8d4388',
  '#796214',
  '#166c77',
];
export function hours(minutes: number) {
  return (
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(
      minutes / 60,
    ) + ' h'
  );
}
export function pieSlices(buckets: Bucket[]) {
  const positive = buckets.filter(
    (bucket) => Number.isFinite(bucket.minutes) && bucket.minutes > 0,
  );
  const total = positive.reduce((sum, bucket) => sum + bucket.minutes, 0);
  let angle = -Math.PI / 2;
  return positive.map((bucket, index) => {
    const start = angle;
    angle += (bucket.minutes / total) * Math.PI * 2;
    const x = (a: number) => 100 + 85 * Math.cos(a);
    const y = (a: number) => 100 + 85 * Math.sin(a);
    return {
      ...bucket,
      color: colors[index % colors.length],
      full: positive.length === 1,
      path:
        'M100 100 L' +
        x(start) +
        ' ' +
        y(start) +
        ' A85 85 0 ' +
        (angle - start > Math.PI ? 1 : 0) +
        ' 1 ' +
        x(angle) +
        ' ' +
        y(angle) +
        ' Z',
    };
  });
}

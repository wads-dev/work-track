import { z } from 'zod';

export const projectColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal #RRGGBB.');
export const projectPalette = [
  '#2563eb',
  '#f97316',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#eab308',
  '#06b6d4',
  '#db2777',
] as const;
export type ProjectColorData = { id: string; color?: unknown };
const hash = (id: string) =>
  Array.from(id).reduce(
    (n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0,
    0,
  );
const configured = (value: unknown) => {
  const result = projectColor.safeParse(value);
  return result.success ? result.data.toLowerCase() : undefined;
};

/** Project presentation policy: explicit color wins; automatic colors avoid catalog collisions.
 * Pass the same complete authorized catalog in every view, never just visible events.
 */
export class ProjectAppearance {
  constructor(private readonly project: ProjectColorData) {}
  getColor(catalog: readonly ProjectColorData[] = []): string {
    const explicit = configured(this.project.color);
    if (explicit) return explicit;
    const projects = [
      ...new Map([...catalog, this.project].map((p) => [p.id, p])).values(),
    ].sort((a, b) => a.id.localeCompare(b.id));
    const assigned = new Map<string, string>();
    const used = new Set(
      projects.map((p) => configured(p.color)).filter((c): c is string => !!c),
    );
    for (const project of projects) {
      const explicit = configured(project.color);
      if (explicit) {
        assigned.set(project.id, explicit);
        continue;
      }
      const first = hash(project.id) % projectPalette.length;
      const available = Array.from(
        { length: projectPalette.length },
        (_, i) => projectPalette[(first + i) % projectPalette.length]!,
      ).find((c) => !used.has(c));
      const color = available ?? projectPalette[first]!;
      assigned.set(project.id, color);
      used.add(color);
    }
    return assigned.get(this.project.id)!;
  }
}

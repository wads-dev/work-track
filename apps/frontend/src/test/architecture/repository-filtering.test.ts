import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const selectorMethods = new Set([
  'filter',
  'slice',
  'find',
  'findIndex',
  'flatMap',
]);
/** Exact call-site permissions, never a whole-file exception. Each is a codec,
 * single-event rendering, form-state update or interval/chart geometry operation.
 * New business list/project/person/topic/period/state selectors must live in a
 * repository, including option datasets and pagination. */
const allowances: { file: string; expression: string; reason: string }[] = [
  {
    file: 'apps/frontend/src/features/projects/ProjectTimeMultipliers.tsx',
    expression:
      "Object . entries ( original . data ) . flatMap ( ( [ userId , history ] ) => history . map ( ( rule ) => ( { userId , multiplier : String ( rule . multiplier ) , effectiveFrom : rule . effectiveFrom ?? '' } ) ) )",
    reason:
      'Validated single-project multiplier configuration transformed into unsaved editor rows, not dataset selection',
  },
  {
    file: 'apps/frontend/src/features/projects/ProjectTimeMultipliers.tsx',
    expression: 'rows . filter ( ( _ , i ) => i !== index )',
    reason:
      'Delete one unsaved configuration form row by local index, not a business listing query',
  },
  {
    file: 'apps/frontend/src/features/people/person-identity.ts',
    expression:
      'name . split ( / \\ s + / ) . filter ( Boolean ) . slice ( 0 , 2 )',
    reason: 'Identity initials string codec',
  },
  {
    file: 'apps/frontend/src/features/people/person-identity.ts',
    expression: 'name . split ( / \\ s + / ) . filter ( Boolean )',
    reason: 'Identity initials string codec',
  },
  {
    file: 'apps/frontend/src/features/records/record-edit.ts',
    expression: 'p . find ( ( item ) => item . type === key )',
    reason: 'Intl date format codec',
  },
  {
    file: 'apps/frontend/src/features/reports/calendar-utils.ts',
    expression: 'parts . find ( ( p ) => p . type === type )',
    reason: 'ISO and Intl calendar date codecs',
  },
  {
    file: 'apps/frontend/src/features/reports/calendar-utils.ts',
    expression: 'd . toISOString ( ) . slice ( 0 , 10 )',
    reason: 'ISO and Intl calendar date codecs',
  },
  {
    file: 'apps/frontend/src/features/reports/calendar-utils.ts',
    expression: 'parts . find ( ( p ) => p . type === key )',
    reason: 'ISO and Intl calendar date codecs',
  },
  {
    file: 'apps/frontend/src/features/reports/calendar-utils.ts',
    expression: 'day . slice ( 0 , 7 )',
    reason: 'ISO and Intl calendar date codecs',
  },
  {
    file: 'apps/frontend/src/features/reports/calendar-utils.ts',
    expression:
      'new Date ( Date . UTC ( d . getUTCFullYear ( ) , d . getUTCMonth ( ) + direction , 1 , 12 ) ) . toISOString ( ) . slice ( 0 , 10 )',
    reason: 'ISO and Intl calendar date codecs',
  },
  {
    file: 'apps/frontend/src/features/reports/report-chart.ts',
    expression:
      'buckets . filter ( ( bucket ) => Number . isFinite ( bucket . minutes ) && bucket . minutes > 0 )',
    reason: 'Positive finite chart geometry, not business selection',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression: 'items . filter ( ( item ) => item . end > item . start )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression:
      'intervals . filter ( ( i ) => i . end > i . start ) . map ( ( i ) => ( { start : Math . max ( first , i . start ) , end : Math . min ( last , i . end ) } ) ) . filter ( ( i ) => i . end > i . start )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression: 'intervals . filter ( ( i ) => i . end > i . start )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression:
      'union . slice ( 1 ) . map ( ( item , index ) => ( { start : union [ index ] . end , end : item . start } ) ) . filter ( ( g ) => g . end - g . start > = 240 )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression: 'union . slice ( 1 )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression:
      'segments . find ( ( s ) => minute > = s . start && minute <= s . end )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression:
      'items . map ( ( item ) => ( { item , start : Math . max ( start , Date . parse ( item . effectiveStartedAt ) ) , end : Math . min ( end , Date . parse ( item . effectiveEndedAt ) ) , point : item . estimated === true && Date . parse ( item . effectiveStartedAt ) === Date . parse ( item . effectiveEndedAt ) , column : 0 , columns : 1 } ) ) . filter ( ( x ) => Number . isFinite ( x . start ) && Number . isFinite ( x . end ) && ( x . point ? x . start === x . end && x . start > = start && x . start < end && Date . parse ( x . item . effectiveStartedAt ) === x . start : x . end > x . start ) )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/reports/timeline-layout.ts',
    expression: 'columnEnds . findIndex ( ( value ) => value <= item . start )',
    reason: 'Day-cell clipping, collision columns and axis-gap geometry',
  },
  {
    file: 'apps/frontend/src/features/records/RecordAuditEvent.tsx',
    expression:
      'Object . keys ( names ) . filter ( ( key ) => JSON . stringify ( before [ key ] ) !== JSON . stringify ( after [ key ] ) )',
    reason: 'Single immutable audit-event field rendering, not listing',
  },
  {
    file: 'apps/frontend/src/features/records/RecordAuditEvent.tsx',
    expression:
      'objects ( record . topicSnapshots ) . find ( ( s ) => s . id === t . topicId )',
    reason: 'Single immutable audit-event field rendering, not listing',
  },
  {
    file: 'apps/frontend/src/features/reports/InteractiveChart.tsx',
    expression: 'label . slice ( 0 , 17 )',
    reason: 'Finite positive chart geometry and caption string codec',
  },
  {
    file: 'apps/frontend/src/features/projects/ProjectSelector.tsx',
    expression: "value . slice ( 'project:' . length )",
    reason: 'Select value string codec and DOM keyboard focus traversal',
  },
  {
    file: 'apps/frontend/src/features/projects/ProjectSelector.tsx',
    expression:
      "Array . from ( document . querySelectorAll < HTMLElement > ( 'button, a[href], input, select, textarea, [tabindex]' ) ) . filter ( ( element ) => element . tabIndex > = 0 && ! element . matches ( ':disabled' ) && ! element . closest ( '[inert], [aria-hidden=\"true\"]' ) && ! contentRef . current ?. contains ( element ) && element . getClientRects ( ) . length > 0 )",
    reason: 'Select value string codec and DOM keyboard focus traversal',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression: "p . find ( ( x ) => x . type === 'hour' )",
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression: "p . find ( ( x ) => x . type === 'minute' )",
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression:
      'data . flatMap ( ( d ) => d . events . map ( ( e ) => ( { start : e . wallStart , end : e . wallEnd } ) ) )',
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression:
      'Array . from ( { length : span . last > span . first ? ( span . last - span . first ) / 60 + 1 : 0 } , ( _ , i ) => span . first + i * 60 ) . filter ( ( minute ) => ! segments . some ( ( s ) => s . collapsed && minute > s . start && minute < s . end ) )',
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression:
      'segments . filter ( ( s ) => gaps . some ( ( g ) => g . start === s . start && g . end === s . end ) )',
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression: 'expanded . filter ( ( k ) => k !== key )',
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression: 'd . events . filter ( ( e ) => ! e . point )',
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression: "returnTo . split ( '?' ) . slice ( 1 )",
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/CalendarTimeline.tsx',
    expression: 'd . events . filter ( ( e ) => e . point )',
    reason:
      'Intl/URL codecs, day-cell point/interval geometry and expansion form state',
  },
  {
    file: 'apps/frontend/src/features/reports/PersonalPage.tsx',
    expression:
      "new Date ( Date . parse ( day + 'T12:00:00Z' ) + 86400000 ) . toISOString ( ) . slice ( 0 , 10 )",
    reason: 'ISO date label codec',
  },
];

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return ['test', 'tests', '__tests__', 'test-support'].includes(entry.name)
        ? []
        : sources(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)
      ? [path]
      : [];
  });
}
function expressionIdentity(text: string) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    text,
  );
  const tokens: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken)
    tokens.push(scanner.getTokenText());
  return tokens
    .filter(
      (token, index) =>
        token !== ',' || ![')', ']', '}'].includes(tokens[index + 1]),
    )
    .join(' ');
}
function forbiddenSelectors(path: string, text: string): string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const failures: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const method = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : ts.isElementAccessExpression(expression) &&
            expression.argumentExpression &&
            ts.isStringLiteralLike(expression.argumentExpression)
          ? expression.argumentExpression.text
          : '';
      if (selectorMethods.has(method)) {
        const call = node.getText(source).replace(/\s+/g, ' ').trim();
        if (
          !allowances.some(
            (entry) =>
              entry.file === path &&
              entry.expression === expressionIdentity(node.getText(source)),
          )
        ) {
          const line =
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1;
          failures.push(path + ':' + line + ' — ' + call);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return failures;
}

describe('dataset selection belongs to native database repositories', () => {
  it('guards actual syntax, including multiline and computed selectors, without banning strings/comments', () => {
    expect(
      forbiddenSelectors(
        'view.ts',
        "const note = '.filter('; // rows.filter(predicate)\nconst result = rows\n .filter(predicate).slice(0, 5);\nconst match = options['find'](predicate);",
      ),
    ).toEqual([
      'view.ts:2 — rows .filter(predicate).slice(0, 5)',
      'view.ts:2 — rows .filter(predicate)',
      "view.ts:4 — options['find'](predicate)",
    ]);
    expect(
      forbiddenSelectors(
        'view.ts',
        'const result = rows.map(render); const value = lookup.get(id);',
      ),
    ).toEqual([]);
  });
  it('allows only declared geometry/form/codec calls independent of formatting, never extra business predicates', () => {
    const path = 'apps/frontend/src/features/reports/timeline-layout.ts';
    expect(
      forbiddenSelectors(
        path,
        'const valid = items . filter ( (item) => item.end > item.start , );',
      ),
    ).toEqual([]);
    expect(
      forbiddenSelectors(
        path,
        'const valid = items.filter(item => item.end > item.start && item.projectId === selected);',
      ),
    ).toHaveLength(1);
    expect(
      expressionIdentity('rows.filter( /* trivia */ (row) => row.estimated, )'),
    ).toBe(expressionIdentity('rows.filter((row) => row.estimated)'));
  });
  it('rejects business selectors in every view, hook, shared UI helper, controller and core application', () => {
    const files = [
      ...sources(resolve(root, 'apps/frontend/src/features')),
      ...sources(resolve(root, 'apps/frontend/src/shared')),
      ...sources(resolve(root, 'apps/frontend/src/app')),
      ...sources(resolve(root, 'apps/frontend/src/hooks')),
      ...sources(resolve(root, 'apps/frontend/src/components')),
      ...sources(resolve(root, 'apps/backend/src/modules')).filter((path) =>
        path.includes('/presentation/'),
      ),
      ...sources(resolve(root, 'packages/core/src')).filter((path) =>
        path.includes('/application/'),
      ),
    ];
    const failures = files.flatMap((absolute) => {
      const path = relative(root, absolute);
      // Explicit directory repository, not a UI/helper selector exception.
      if (
        path ===
        'apps/frontend/src/features/people/company-people-repository.ts'
      )
        return [];
      return forbiddenSelectors(path, readFileSync(absolute, 'utf8'));
    });
    expect(
      failures,
      'Move business selection into repositories; do not add convenience exceptions:\n' +
        failures.join('\n'),
    ).toEqual([]);
  });
});

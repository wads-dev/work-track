import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFunctionsPolicy,
  legacyFunctions,
} from './check-functions-policy.mjs';
const endpoint = () => Object.assign(() => {}, { __endpoint: {} });
test('accepts MCP and only frozen legacy functions', () => {
  assert.doesNotThrow(() => assertFunctionsPolicy({ mcp: endpoint() }));
  assert.doesNotThrow(() =>
    assertFunctionsPolicy(
      Object.fromEntries(
        ['mcp', ...legacyFunctions].map((name) => [name, endpoint()]),
      ),
    ),
  );
});
test('rejects new callable, HTTP, re-export and non-function exports regardless of name', () => {
  for (const name of [
    'updateCalendarHolidays',
    'newCallable',
    'newHttp',
    'reexportedFunction',
    'api',
  ]) {
    assert.throws(
      () => assertFunctionsPolicy({ mcp: endpoint(), [name]: endpoint() }),
      /Novas Cloud Functions proibidas/,
    );
  }
  assert.throws(
    () => assertFunctionsPolicy({ mcp: endpoint(), config: {} }),
    /proibidas/,
  );
});
test('fails closed for missing MCP and invalid legacy exports', () => {
  assert.throws(() => assertFunctionsPolicy({}), /mcp obrigatório/);
  assert.throws(
    () => assertFunctionsPolicy({ mcp: () => {} }),
    /mcp obrigatório/,
  );
  assert.throws(
    () =>
      assertFunctionsPolicy({ mcp: endpoint(), listCompanyPeople: () => {} }),
    /inválido/,
  );
});

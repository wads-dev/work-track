import { describe, expect, it } from 'vitest';
import { getHealth } from './health.js';

describe('getHealth', () => {
  it('identifica o serviço e seu status', () => {
    expect(getHealth()).toEqual({ status: 'ok', service: 'wads-ponto' });
  });
});

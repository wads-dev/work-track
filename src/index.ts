import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { getHealth } from './health.js';

initializeApp();

// Endpoint público de diagnóstico, sem acesso a dados de usuários.
export const health = onRequest(
  { region: 'southamerica-east1' },
  (_req, res) => {
    res.status(200).json(getHealth());
  },
);

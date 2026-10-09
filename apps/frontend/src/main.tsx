import { createRoot } from 'react-dom/client';

function App() {
  return (
    <main>
      <h1>Work Track</h1>
      <p>Interface de projetos, registros e relatórios em preparação.</p>
      <p>
        O MCP continua disponível em /mcp. A autenticação é iniciada pelo
        cliente MCP.
      </p>
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);

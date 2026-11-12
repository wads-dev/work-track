import {
  developmentEnvironmentKey,
  developmentProductionMode,
} from './development-environment';
/** Never rendered in production artifacts; reload tears down every prior SDK instance. */
export function DevelopmentEnvironmentToggle() {
  if (
    !import.meta.env.DEV ||
    !['localhost', '127.0.0.1'].includes(location.hostname)
  )
    return null;
  const production = developmentProductionMode(
    true,
    location.hostname,
    localStorage,
  );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={production}
      aria-label="Usar Firebase de produção"
      className={
        'fixed bottom-16 right-4 z-50 rounded-full border px-4 py-2 text-xs font-semibold shadow-lg ' +
        (production
          ? 'border-red-500 bg-red-950 text-red-100'
          : 'border-border bg-card text-foreground')
      }
      onClick={() => {
        if (
          !production &&
          !window.confirm(
            'Conectar ao Firebase de PRODUÇÃO? Leituras e alterações usarão dados reais e podem gerar custos. O MCP local continuará no demo.',
          )
        )
          return;
        localStorage.setItem(
          developmentEnvironmentKey,
          production ? 'demo' : 'production',
        );
        location.reload();
      }}
      title="Muda Auth, Firestore e Functions e recarrega a página. Cache separado por projeto. Não altera o MCP local."
    >
      <span>
        {production
          ? 'Firebase: PRODUÇÃO · dados reais'
          : 'Firebase: DEMO local'}
      </span>
    </button>
  );
}

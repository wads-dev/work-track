import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './components/ui/button';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaControls() {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('Não foi possível iniciar o PWA.', error);
    },
  });
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const afterInstall = () => {
      setInstall(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', afterInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', afterInstall);
    };
  }, []);
  async function installApp() {
    if (!install) return;
    setInstalling(true);
    try {
      await install.prompt();
      await install.userChoice;
    } catch (error) {
      console.warn('Instalação não concluída.', error);
    } finally {
      setInstall(null);
      setInstalling(false);
    }
  }
  return (
    <div className="space-y-2">
      {!installed && install && (
        <Button
          variant="outline"
          className="w-full"
          disabled={installing}
          onClick={() => void installApp()}
        >
          {installing ? 'Instalando…' : 'Instalar aplicativo'}
        </Button>
      )}
      {!installed && ios && (
        <p className="text-xs text-muted-foreground">
          No Safari, toque em Compartilhar e depois em “Adicionar à Tela de
          Início”.
        </p>
      )}
      {needRefresh && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            Uma nova versão está disponível. Atualize quando terminar o que está
            fazendo.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void updateServiceWorker(true)}>
              Atualizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNeedRefresh(false)}
            >
              Depois
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

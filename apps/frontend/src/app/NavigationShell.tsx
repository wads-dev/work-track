import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet';
import { cn } from '../lib/utils';
import { useMediaQuery } from '../shared/ui/theme';
import { UiIcon } from '../shared/ui/UiIcons';
import { layoutTokens } from '../shared/ui/layout-tokens';

const desktopMenuStorageKey = 'work-track:desktop-menu-open';

export function useNavigationMenu() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [desktopOpen, setDesktopOpen] = useState(() => {
    try {
      return localStorage.getItem(desktopMenuStorageKey) !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(desktopMenuStorageKey, String(desktopOpen));
    } catch {
      // Storage may be blocked; the current session still honors the choice.
    }
  }, [desktopOpen]);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Never carry a modal overlay across the desktop breakpoint. Keep the
  // desktop choice separate so a resize does not undo a collapsed sidebar.
  useEffect(() => setMobileOpen(false), [desktop]);
  return {
    desktop,
    open: desktop ? desktopOpen : mobileOpen,
    setOpen: desktop ? setDesktopOpen : setMobileOpen,
  };
}

export function NavigationShell({
  desktop,
  open,
  setOpen,
  navigation,
  header,
  children,
}: {
  desktop: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  navigation: (onNavigate: () => void, compact: boolean) => ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  const toggle = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        open ? 'Recolher menu de navegação' : 'Abrir menu de navegação'
      }
      aria-expanded={open}
      aria-controls="menu-principal"
      onClick={desktop ? () => setOpen(!open) : undefined}
    >
      <UiIcon kind="menu" />
    </Button>
  );
  const inset =
    desktop &&
    cn(
      'transition-[margin-left] duration-200 ease-in-out motion-reduce:transition-none',
      open ? 'lg:ml-64' : 'lg:ml-20',
    );
  return (
    <>
      {desktop && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 overflow-x-hidden overflow-y-auto border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out motion-reduce:transition-none',
            open ? 'w-64' : 'w-20',
          )}
        >
          {navigation(() => {}, !open)}
        </aside>
      )}
      <Sheet open={!desktop && open} onOpenChange={setOpen}>
        {!desktop && (
          <SheetContent side="left" className="w-64 overflow-y-auto p-0">
            <SheetTitle className="sr-only">Navegação</SheetTitle>
            <SheetDescription className="sr-only">
              Menu principal do Work Track
            </SheetDescription>
            {navigation(() => setOpen(false), false)}
          </SheetContent>
        )}
        <header
          className={cn(
            'sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 sm:px-4 backdrop-blur',
            layoutTokens.controls,
            inset,
          )}
        >
          {desktop ? toggle : <SheetTrigger asChild>{toggle}</SheetTrigger>}
          {header}
        </header>
      </Sheet>
      <main
        id="conteudo"
        tabIndex={-1}
        className={cn('min-w-0 p-3 sm:p-4', inset)}
      >
        {children}
      </main>
    </>
  );
}

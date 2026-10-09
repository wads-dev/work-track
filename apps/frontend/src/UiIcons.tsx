import { SvgIcon } from '@mui/material';
export function UiIcon({
  kind,
}: {
  kind: 'detail' | 'bell' | 'rules' | 'projects' | 'home';
}) {
  const paths = {
    detail: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1 5h2v2h-2m0 2h2v6h-2',
    bell: 'M12 2a2 2 0 0 0-2 2v1c-3 1-4 3-4 6v5l-2 2h16l-2-2v-5c0-3-1-5-4-6V4a2 2 0 0 0-2-2m-2 18a2 2 0 0 0 4 0',
    rules: 'M5 3h14v18H5V3m3 4v2h8V7m-8 4v2h8v-2m-8 4v2h6v-2',
    projects: 'M3 5h7l2 2h9v13H3V5',
    home: 'M3 11l9-8 9 8v10h-6v-7H9v7H3V11',
  };
  return (
    <SvgIcon aria-hidden="true">
      <path d={paths[kind]} />
    </SvgIcon>
  );
}

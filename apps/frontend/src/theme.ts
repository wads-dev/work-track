import { createTheme } from '@mui/material';
export function workTheme(mode: 'light' | 'dark', reduceMotion: boolean) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#9EB3FF' : '#3158D5' },
      background: {
        default: dark ? '#11141B' : '#F6F7F9',
        paper: dark ? '#191E28' : '#FFFFFF',
      },
      text: {
        primary: dark ? '#EDF1F7' : '#172033',
        secondary: dark ? '#A6B0C2' : '#667085',
      },
      divider: dark ? '#303849' : '#E2E6EC',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Geist Variable",system-ui,sans-serif',
      fontSize: 14,
      h1: { fontSize: 22, fontWeight: 650 },
      h2: { fontSize: 20, fontWeight: 650 },
      h3: { fontSize: 16, fontWeight: 600 },
      h4: { fontSize: 30, fontWeight: 650 },
      h5: { fontSize: 26, fontWeight: 650 },
      h6: { fontSize: 16, fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    transitions: reduceMotion
      ? {
          duration: {
            standard: 0,
            short: 0,
            shorter: 0,
            enteringScreen: 0,
            leavingScreen: 0,
          },
        }
      : {},
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            boxShadow: 'none',
            border: '1px solid ' + (dark ? '#303849' : '#E2E6EC'),
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8, minHeight: 40 } },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            width: 40,
            height: 40,
            '@media(max-width:600px)': { width: 44, height: 44 },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: 8, fontSize: 14 } },
      },
      MuiInputLabel: { styleOverrides: { root: { fontSize: 13 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: dark ? '#191E28' : '#FFFFFF',
            color: dark ? '#EDF1F7' : '#172033',
            boxShadow: 'none',
            borderBottom: '1px solid ' + (dark ? '#303849' : '#E2E6EC'),
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: dark ? '#303849' : '#E2E6EC',
            padding: '12px 16px',
          },
          head: {
            fontSize: 12,
            fontWeight: 600,
            color: dark ? '#A6B0C2' : '#667085',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 12px',
            '&.Mui-selected': { background: dark ? '#27334D' : '#EDF1FD' },
          },
        },
      },
    },
  });
}

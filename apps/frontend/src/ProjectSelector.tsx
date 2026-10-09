import { useMemo, useState } from 'react';
import {
  Autocomplete,
  TextField,
  type SxProps,
  type Theme,
} from '@mui/material';
import { matchesProject, type ProjectOption } from './project-search';
export function ProjectSelector({
  projects,
  projectId,
  onChange,
  loading = false,
  error = '',
  label = 'Projeto',
  sx,
  allowAll = true,
  disabled = false,
}: {
  projects: ProjectOption[];
  projectId: string;
  onChange: (id: string) => void;
  loading?: boolean;
  error?: string;
  label?: string;
  sx?: SxProps<Theme>;
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const options = useMemo(
    () =>
      allowAll
        ? [{ id: '', label: 'Todos os projetos' }, ...projects]
        : projects,
    [projects, allowAll],
  );
  const selected = options.find((option) => option.id === projectId) ?? {
    id: projectId,
    label: projectId ? 'Projeto não disponível' : 'Escolha o projeto',
  };
  const [input, setInput] = useState<{
    id: string;
    label: string;
    query: string;
  } | null>(null);
  const inputValue =
    input?.id === projectId && input.label === selected.label
      ? input.query
      : selected.label;
  return (
    <Autocomplete
      size="small"
      sx={sx ?? { width: { xs: '100%', sm: 240 }, minWidth: 0 }}
      options={options}
      value={selected}
      inputValue={inputValue}
      disabled={disabled}
      getOptionLabel={(option) => option.label}
      getOptionKey={(option) => option.id}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(items, state) =>
        items.filter((option) => matchesProject(option, state.inputValue))
      }
      onInputChange={(_, value, reason) => {
        if (reason === 'input')
          setInput({ id: projectId, label: selected.label, query: value });
      }}
      onChange={(_, option, reason) => {
        if (reason === 'selectOption' || reason === 'clear') {
          setInput(null);
          onChange(option?.id ?? '');
        }
      }}
      loading={loading}
      loadingText="Carregando projetos…"
      noOptionsText="Nenhum projeto encontrado"
      clearText="Limpar projeto"
      openText="Pesquisar projetos"
      closeText="Fechar projetos"
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Pesquisar projeto"
          error={!!error}
          helperText={error || undefined}
        />
      )}
    />
  );
}

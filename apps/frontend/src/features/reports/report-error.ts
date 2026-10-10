export function reportError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'functions/resource-exhausted'
  )
    return 'Não foi possível completar o contexto global necessário ao orçamento diário. Nenhuma estimativa foi apresentada. O limite considera o histórico completo; reduzir o período não resolve esse limite. Tente novamente ou solicite suporte para conciliar o histórico.';
  return 'Não foi possível carregar o relatório. Confira sua conexão e permissão e tente novamente.';
}

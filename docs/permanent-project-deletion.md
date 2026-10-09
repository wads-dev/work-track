# Exclusão permanente de projeto pelo frontend

Este fluxo é distinto de arquivar projetos e de remover registros pelo MCP. O MCP continua realizando remoção lógica, preservando auditoria. A exclusão permanente é disponibilizada somente ao criador do projeto autenticado e apaga documentos físicos.

## Ordem obrigatória

1. Solicitar ao backend uma exportação JSON completa do projeto, seus tópicos, registros (inclusive removidos logicamente) e documentos relacionados.
2. Iniciar o download do JSON no navegador. O navegador não pode comprovar que o arquivo foi salvo no disco; a interface exige confirmação explícita da pessoa de que guardou a cópia.
3. Confirmar a identidade do projeto e o caráter irreversível da operação. Projetos Global podem conter registros de outras pessoas; as horas históricas desses registros também serão removidas.
4. Enviar ao backend o comprovante de exportação emitido pelo servidor e a confirmação explícita. O backend verifica novamente autoria e o snapshot completo antes de apagar os documentos em uma única transação.

Alterações posteriores ao backup exigem uma nova exportação. Falha na exportação ou no download não deve habilitar a exclusão. A confirmação de download não representa prova técnica de gravação em disco.

## Segurança e escopo

Não há ferramenta MCP para exclusão permanente. A nova operação não afrouxa regras Firestore e não utiliza exclusão parcial em lotes. Inventários maiores que o limite seguro da transação, estruturas não suportadas e históricos que ligam outros projetos são recusados sem apagar dados; nunca se trunca o backup para permitir excluir. O JSON pode conter informações confidenciais e deve ser armazenado com cuidado.

Nenhuma exclusão de dados reais é necessária para validar ou publicar o recurso.

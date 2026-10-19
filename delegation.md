# Delegação

A sessão principal planeja e revisa. A escrita de código fica com o executor.

- Quebre o pedido em tarefas pequenas, uma por executor.
- Tarefas independentes vão em paralelo.
- Veio errado? Mande o executor corrigir.
- Código direto só para ajuste de 1 ou 2 linhas.
- Não passe `model` nem `effort` ao chamar o Agent ou nos `agent()` de workflows. O hook model-router pergunta ao Jev e preenche os dois. Só fixe quando tiver um motivo concreto.
- No prompt do executor, descreva a tarefa com clareza: o Jev escolhe o modelo lendo esse texto.

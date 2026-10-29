# academia-bairro

## Ao terminar uma tarefa

Toda resposta que encerra uma tarefa da sessão termina com a seção **Próximo passo**:

- uma linha dizendo qual é o próximo passo do projeto e por quê, a partir de `.specs/STATE.md`
  (Handoff), `.specs/ROADMAP.md` e do estado da feature em andamento;
- o prompt pronto para colar, num bloco de código, completo o bastante para rodar numa sessão nova
  (comando ou skill, nome da feature, o que ler antes, onde parar);
- o modelo e o esforço recomendados para rodar esse prompt, numa linha, com o motivo. Critério:
  plano, checks, Verifier e slice de domínio central ou de segurança pedem o modelo mais capaz e
  esforço alto; slice mecânico (telas repetidas, ajuste de documentação, renomeação) pede modelo
  mais rápido e esforço médio. Se fases do mesmo prompt pedem níveis diferentes, dizer onde trocar;
- se o próximo passo depende de uma decisão do usuário, dizer qual é a decisão antes do prompt.

Uma sugestão só, a que você recomenda. Não vale para respostas a perguntas nem para passos
intermediários de uma tarefa ainda em curso.

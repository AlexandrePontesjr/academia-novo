// O CSP da borda não permite `eval` (door 2, AC 10). A JIT do Zod compila esquemas com
// `new Function`, que o navegador bloquearia e a validação da tela falharia: desligar a compilação
// mantém a validação e é o que sobra quando `'unsafe-eval'` não entra na política.
import { z } from 'zod';

z.config({ jitless: true });

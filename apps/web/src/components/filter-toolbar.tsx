import type { ReactNode } from 'react';
import { Button } from '@academia/ui';

/**
 * A toolbar de filtros (refino visual, AC 51): o mesmo padrão em `/students`, `/payments`,
 * `/check-ins`, `/audit` e `/leads` - os campos rotulados, o par "Filtrar"/"Limpar" e a contagem
 * de resultados. O envio é o do formulário que a tela compõe; "Limpar" zera os filtros.
 */
export function FilterToolbar({
  children,
  count,
  countLabel,
}: {
  children: ReactNode;
  count?: number;
  /** O texto da contagem quando a tela diz outra coisa que "N resultados". */
  countLabel?: string;
}) {
  return (
    <div className="grid gap-4" data-slot="toolbar">
      {children}
      {count !== undefined && (
        <p className="text-sm text-muted-foreground" data-slot="toolbar-count">
          {countLabel ?? `${count} ${count === 1 ? 'resultado' : 'resultados'}`}
        </p>
      )}
    </div>
  );
}

/** O par de ações da toolbar: "Filtrar" envia o formulário e "Limpar" devolve a tela sem filtro. */
export function FilterActions({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit">Filtrar</Button>
      <Button type="button" variant="outline" onClick={onClear}>
        Limpar
      </Button>
    </div>
  );
}

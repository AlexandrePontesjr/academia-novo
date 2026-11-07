import type { ReactNode } from 'react';
import { Table, TableCell, TableHead, TableRow } from './table.tsx';

export interface ListOrTableRow {
  /** A chave da linha: o id do registro. */
  key: string;
  /** As células, na ordem da cabeça. */
  cells: ReactNode[];
}

/**
 * A lista de registros (door 7 do refino visual): abaixo de 768 px cada registro é um cartão
 * empilhado (`data-slot="panel-rows"`, como no painel) e a partir de 768 px a mesma lista vira a
 * `Table` do tema - os mesmos valores na mesma ordem, sem rolagem horizontal no celular.
 */
export function ListOrTable({
  head,
  rows,
  numeric = [],
}: {
  head: string[];
  rows: ListOrTableRow[];
  /** Os índices das colunas numéricas: alinhadas à direita e com `tabular-nums`. */
  numeric?: number[];
}) {
  return (
    <>
      <ul className="grid gap-2 md:hidden" data-slot="panel-rows">
        {rows.map(({ key, cells }) => (
          <li key={key} className="grid gap-1 rounded-xl bg-muted p-3 text-sm">
            {cells.map((cell, index) => (
              <span
                key={head[index]}
                className={
                  numeric.includes(index)
                    ? 'text-right tabular-nums'
                    : index === 0
                      ? 'font-semibold'
                      : 'text-muted-foreground'
                }
              >
                {cell}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              {head.map((title) => (
                <TableHead key={title}>{title}</TableHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, cells }) => (
              <TableRow key={key}>
                {cells.map((cell, index) => (
                  <TableCell key={head[index]} numeric={numeric.includes(index)}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

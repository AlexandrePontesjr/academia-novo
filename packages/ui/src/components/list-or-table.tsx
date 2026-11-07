import type { ComponentProps, ReactNode } from 'react';
import { StaggerCell, StaggerItem } from '../motion.tsx';
import { Table, TableHead, TableRow } from './table.tsx';

export interface ListOrTableRow {
  /** A chave da linha: o id do registro. */
  key: string;
  /** As células, na ordem da cabeça. */
  cells: ReactNode[];
  /** Os atributos da linha da tabela, como o `data-*` que uma prova de outra tela lê. */
  rowProps?: Record<string, string>;
}

/**
 * A lista de registros (door 7 do refino visual): abaixo de 768 px cada registro é um cartão
 * empilhado (`data-slot="panel-rows"`, como no painel) e a partir de 768 px a mesma lista vira a
 * `Table` do tema - os mesmos valores na mesma ordem, sem rolagem horizontal no celular. O cartão
 * responde ao ponteiro como o cartão linkado da AC 23 (sobe 2 px) e as células da tabela entram em
 * cascata pela motion (door 4).
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
        {rows.map(({ key, cells }, rowIndex) => (
          <StaggerItem key={key} index={rowIndex} className="lift grid gap-1 rounded-xl bg-muted p-3 text-sm">
            {cells.map((cell, index) => (
              <div
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
              </div>
            ))}
          </StaggerItem>
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
            {rows.map(({ key, cells, rowProps }, rowIndex) => (
              <TableRow key={key} {...(rowProps as ComponentProps<'tr'>)}>
                {cells.map((cell, index) => (
                  <StaggerCell
                    key={head[index]}
                    index={rowIndex}
                    className={numeric.includes(index) ? 'text-right tabular-nums' : undefined}
                  >
                    {cell}
                  </StaggerCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

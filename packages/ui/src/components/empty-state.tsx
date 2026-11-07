import type { ReactNode } from 'react';

/**
 * O estado vazio de uma lista ou de um bloco (door 7 do refino visual): o ícone de 24 px escondido
 * da árvore de acessibilidade, o título de 16 px em peso médio, a descrição opcional de 14 px e a
 * ação opcional - nunca um `Alert`, que é o aviso de falha.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl bg-muted p-6 text-center" data-slot="empty-state">
      <span aria-hidden="true" className="[&>svg]:size-6" data-slot="empty-state-icon">
        {icon}
      </span>
      <p className="text-base font-medium" data-slot="empty-state-title">
        {title}
      </p>
      {description && (
        <p className="text-sm text-muted-foreground" data-slot="empty-state-description">
          {description}
        </p>
      )}
      {action && <div data-slot="empty-state-action">{action}</div>}
    </div>
  );
}

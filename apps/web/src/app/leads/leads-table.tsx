'use client';

import type { Lead, LeadStatus } from '@academia/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  ListOrTable,
  StatusBadge,
} from '@academia/ui';
import Link from 'next/link';
import { useState } from 'react';
import { callApi, UNAVAILABLE } from '../../lib/api.ts';
import { formatReceivedAt, LEAD_CONFLICT_MESSAGES, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from '../../lib/leads.ts';
import { formatPhone } from '../../lib/students.ts';

const FAILED = 'Não foi possível concluir. Tente novamente.';

/**
 * A lista de interessados com as ações de cada linha: marcar contatado e reabrir sem confirmação,
 * descartar num diálogo que nomeia o interessado, e matricular para quem cadastra aluno. A tabela vira
 * cartões abaixo de 768 px (AC 50) e a situação é o `StatusBadge` da door 7.
 */
export function LeadsTable({ leads, canConvert }: { leads: Lead[]; canConvert: boolean }) {
  const [rows, setRows] = useState(leads);
  const [pending, setPending] = useState<string>();
  const [alerts, setAlerts] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState<Lead>();

  async function change(lead: Lead, status: LeadStatus) {
    setPending(lead.id);
    setAlerts((current) => ({ ...current, [lead.id]: '' }));
    const result = await callApi<Lead>('PATCH', `/api/leads/${lead.id}`, { status });
    setPending(undefined);
    setDiscarding(undefined);
    if (result.kind === 'ok') {
      setRows((current) => current.map((row) => (row.id === lead.id ? result.data : row)));
      return;
    }
    const message =
      result.kind === 'problem' ? (LEAD_CONFLICT_MESSAGES[result.code] ?? FAILED) : result.kind === 'unavailable' ? UNAVAILABLE : FAILED;
    setAlerts((current) => ({ ...current, [lead.id]: message }));
  }

  return (
    <>
      <ListOrTable
        head={['Nome', 'E-mail', 'Telefone', 'Origem', 'E-mail confirmado', 'Recebido em', 'Situação']}
        rows={rows.map((lead) => ({
          key: lead.id,
          rowProps: { 'data-lead': lead.id },
          cells: [
            lead.name,
            <span key="email" className="break-all">
              {lead.email}
            </span>,
            <span key="phone" className="whitespace-nowrap">
              {formatPhone(lead.phone)}
            </span>,
            LEAD_SOURCE_LABELS[lead.source],
            lead.emailVerified ? 'Sim' : 'Não',
            <span key="received" className="whitespace-nowrap">
              {formatReceivedAt(lead.createdAt)}
            </span>,
            // as ações da linha moram na célula da situação: a tabela tem as sete colunas da AC 48
            <div key="status" className="grid gap-2">
              <div data-slot="lead-status">
                <StatusBadge variant="lead" status={lead.status}>
                  {LEAD_STATUS_LABELS[lead.status]}
                </StatusBadge>
              </div>
              <div className="flex flex-wrap items-center gap-2 empty:hidden">
                {lead.status === 'new' && (
                  <Button variant="outline" busy={pending === lead.id} onClick={() => change(lead, 'contacted')}>
                    Marcar contatado
                  </Button>
                )}
                {(lead.status === 'new' || lead.status === 'contacted') && (
                  <>
                    {canConvert && (
                      <Button asChild>
                        <Link href={`/students/new?lead=${lead.id}`} prefetch={false}>
                          Matricular
                        </Link>
                      </Button>
                    )}
                    <Button variant="destructive" onClick={() => setDiscarding(lead)}>
                      Descartar
                    </Button>
                  </>
                )}
                {lead.status === 'discarded' && (
                  <Button variant="outline" busy={pending === lead.id} onClick={() => change(lead, 'new')}>
                    Reabrir
                  </Button>
                )}
              </div>
              {alerts[lead.id] && <Alert variant="destructive">{alerts[lead.id]}</Alert>}
            </div>,
          ],
        }))}
      />

      <Dialog open={discarding !== undefined} onOpenChange={(open) => !open && setDiscarding(undefined)}>
        <DialogContent>
          <DialogTitle>Descartar interessado</DialogTitle>
          <DialogDescription>
            {discarding?.name} sai da lista de interessados em aberto. Para trazê-lo de volta, use Reabrir em Descartado.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Voltar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              busy={pending !== undefined && pending === discarding?.id}
              onClick={() => discarding && change(discarding, 'discarded')}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

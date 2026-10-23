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
  StaggerCell,
  Table,
  TableHead,
  TableRow,
} from '@academia/ui';
import Link from 'next/link';
import { useState } from 'react';
import { callApi, UNAVAILABLE } from '../../lib/api.ts';
import { formatReceivedAt, LEAD_CONFLICT_MESSAGES, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from '../../lib/leads.ts';
import { formatPhone } from '../../lib/students.ts';

const FAILED = 'Não foi possível concluir. Tente novamente.';

/**
 * A tabela de interessados com as ações de cada linha: marcar contatado e reabrir sem confirmação,
 * descartar num diálogo que nomeia o interessado, e matricular para quem cadastra aluno.
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
      <Table>
        <thead>
          <tr>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>E-mail confirmado</TableHead>
            <TableHead>Recebido em</TableHead>
            <TableHead>Situação</TableHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead, index) => (
            <TableRow key={lead.id} data-lead={lead.id}>
              <StaggerCell index={index}>{lead.name}</StaggerCell>
              <StaggerCell index={index} className="break-all">
                {lead.email}
              </StaggerCell>
              <StaggerCell index={index} className="whitespace-nowrap">
                {formatPhone(lead.phone)}
              </StaggerCell>
              <StaggerCell index={index}>{LEAD_SOURCE_LABELS[lead.source]}</StaggerCell>
              <StaggerCell index={index}>{lead.emailVerified ? 'Sim' : 'Não'}</StaggerCell>
              <StaggerCell index={index} className="whitespace-nowrap">
                {formatReceivedAt(lead.createdAt)}
              </StaggerCell>
              {/* as ações da linha moram na célula da situação: a tabela tem as sete colunas da AC 48 */}
              <StaggerCell index={index}>
                <span className="block" data-slot="lead-status">
                  {LEAD_STATUS_LABELS[lead.status]}
                </span>
                <div className="mt-2 flex flex-wrap items-center gap-2 empty:hidden">
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
              </StaggerCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

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

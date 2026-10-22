'use client';

import type { Role, StudentsResponse, StudentStatus } from '@academia/contracts';
import { Alert, Button, Input, Label, Select, StaggerCell, Table, TableHead, TableRow } from '@academia/ui';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { PersonPhoto } from '../../components/photo/person-photo.tsx';
import { callApi } from '../../lib/api.ts';
import { formatCpf, formatPhone, STATUS_LABELS } from '../../lib/students.ts';

interface Applied {
  q: string;
  status: '' | StudentStatus;
  cursor?: string;
}

const STATUS_OPTIONS: Array<{ value: '' | StudentStatus; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'inactive', label: STATUS_LABELS.inactive },
  { value: 'suspended', label: STATUS_LABELS.suspended },
];

/**
 * A lista com a busca. A busca e a página seguinte vão à API pelo navegador e não mexem no endereço
 * da página: o que se digita (um CPF, um telefone) não fica no histórico nem no log de acesso.
 */
export function StudentsList({ initial, role }: { initial: StudentsResponse; role: Role }) {
  const searchId = useId();
  const statusId = useId();
  const [page, setPage] = useState(initial);
  const [applied, setApplied] = useState<Applied>({ q: '', status: '' });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | StudentStatus>('');
  const [failed, setFailed] = useState<Applied>();
  const withContact = role !== 'instructor';

  async function load(next: Applied) {
    const query = new URLSearchParams();
    if (next.q) query.set('q', next.q);
    if (next.status) query.set('status', next.status);
    if (next.cursor) query.set('cursor', next.cursor);
    const result = await callApi<StudentsResponse>('GET', `/api/students${query.size > 0 ? `?${query}` : ''}`);
    if (result.kind !== 'ok') {
      setFailed(next);
      return;
    }
    setFailed(undefined);
    setApplied(next);
    setPage(result.data);
  }

  function search(event: FormEvent) {
    event.preventDefault();
    return load({ q: q.trim(), status });
  }

  function clear() {
    setQ('');
    setStatus('');
    return load({ q: '', status: '' });
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={search} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={searchId}>Buscar por nome, CPF ou telefone</Label>
            <Input id={searchId} name="q" value={q} maxLength={100} onChange={(event) => setQ(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={statusId}>Situação</Label>
            <Select
              id={statusId}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | StudentStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Buscar</Button>
          <Button variant="outline" onClick={clear}>
            Limpar
          </Button>
        </div>
      </form>

      {failed ? (
        <div className="grid justify-items-start gap-4">
          <Alert variant="destructive">Não foi possível carregar os alunos.</Alert>
          <Button variant="outline" onClick={() => load(failed)}>
            Tentar novamente
          </Button>
        </div>
      ) : page.items.length === 0 ? (
        <p>{applied.q || applied.status ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado.'}</p>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <TableHead>Nome</TableHead>
                {withContact && <TableHead>CPF</TableHead>}
                {withContact && <TableHead>Telefone</TableHead>}
                <TableHead>Situação</TableHead>
              </tr>
            </thead>
            <tbody>
              {page.items.map((student, index) => (
                <TableRow key={student.id}>
                  <StaggerCell index={index}>
                    <div className="flex items-center gap-3">
                      <PersonPhoto name={student.name} photoUrl={student.photoUrl} shape="thumb" />
                      <Link
                        href={`/students/${student.id}`}
                        prefetch={false}
                        className="text-primary underline underline-offset-4"
                      >
                        {student.name}
                      </Link>
                    </div>
                  </StaggerCell>
                  {withContact && <StaggerCell index={index}>{formatCpf(student.cpf ?? '')}</StaggerCell>}
                  {withContact && <StaggerCell index={index}>{formatPhone(student.phone ?? '')}</StaggerCell>}
                  <StaggerCell index={index}>{STATUS_LABELS[student.status]}</StaggerCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          {page.nextCursor && (
            <div>
              <Button variant="outline" onClick={() => load({ ...applied, cursor: page.nextCursor! })}>
                Próxima página
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

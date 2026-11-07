'use client';

import type { Role, StudentsResponse, StudentStatus } from '@academia/contracts';
import { Alert, Button, EmptyState, Input, Label, ListOrTable, Select, StatusBadge, UsersIcon } from '@academia/ui';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { FilterActions, FilterToolbar } from '../../components/filter-toolbar.tsx';
import { TEXT_LINK } from '../../components/link-class.ts';
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
 * da página: o que se digita (um CPF, um telefone) não fica no histórico nem no log de acesso. A
 * toolbar é a mesma das outras listas (AC 51) e a tabela vira cartões abaixo de 768 px (AC 50).
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

  const filtered = applied.q !== '' || applied.status !== '';

  return (
    <div className="grid gap-4">
      <FilterToolbar count={page.items.length}>
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
          <FilterActions onClear={clear} />
        </form>
      </FilterToolbar>

      {failed ? (
        <div className="grid justify-items-start gap-4">
          <Alert variant="destructive">Não foi possível carregar os alunos.</Alert>
          <Button variant="outline" onClick={() => load(failed)}>
            Tentar novamente
          </Button>
        </div>
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={filtered ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado.'}
          {...(filtered ? { description: 'Tente outro nome, CPF, telefone ou situação.' } : {})}
        />
      ) : (
        <>
          <ListOrTable
            head={withContact ? ['Nome', 'CPF', 'Telefone', 'Situação'] : ['Nome', 'Situação']}
            rows={page.items.map((student) => ({
              key: student.id,
              cells: [
                <div key="name" className="flex items-center gap-3">
                  <PersonPhoto name={student.name} photoUrl={student.photoUrl} shape="thumb" />
                  <Link href={`/students/${student.id}`} prefetch={false} className={TEXT_LINK}>
                    {student.name}
                  </Link>
                </div>,
                ...(withContact
                  ? [formatCpf(student.cpf ?? ''), formatPhone(student.phone ?? '')]
                  : []),
                <StatusBadge key="status" variant="student" status={student.status}>
                  {STATUS_LABELS[student.status]}
                </StatusBadge>,
              ],
            }))}
          />
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

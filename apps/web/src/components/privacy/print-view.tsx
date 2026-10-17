import type { StaffExport, StudentExport } from '@academia/contracts';
import { Table, TableCell, TableHead, TableRow } from '@academia/ui';
import type { ReactNode } from 'react';
import { formatInstant } from '../../lib/audit.ts';
import { GRANTOR_LABELS, PURPOSE_LABELS, RELATIONSHIP_LABELS } from '../../lib/consents.ts';
import { formatPrice } from '../../lib/plans.ts';
import { ROLE_LABELS } from '../../lib/roles.ts';
import { formatBirthDate, formatCpf, formatPhone, SEX_LABELS, STATUS_LABELS } from '../../lib/students.ts';

const NONE = '—';
const EMPTY = 'Nenhum registro.';

const day = (value: string) => formatBirthDate(value);
const instant = (value: string | null) => (value === null ? NONE : formatInstant(value));
const text = (value: string | null) => value ?? NONE;

/** Uma seção da versão para impressão: o título e o conteúdo, ou "Nenhum registro." quando vazia. */
function Section({ id, title, empty, children }: { id: string; title: string; empty?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 break-inside-avoid">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {empty ? <p>{EMPTY}</p> : children}
    </section>
  );
}

/** Pares de rótulo e valor; o valor é sempre texto, nunca marcação (L-027). */
function Fields({ rows }: { rows: Array<[label: string, value: string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="break-words whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Uma tabela com o cabeçalho e uma linha por item, na ordem da exportação. */
function Rows({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <Table>
      <thead>
        <tr>
          {head.map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, index) => (
          <TableRow key={index}>
            {cells.map((cell, column) => (
              <TableCell key={column} className="break-words whitespace-pre-wrap">
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}

function Photos({ photos }: { photos: StudentExport['photos'] }) {
  return (
    <Section id="print-photos" title="Fotos" empty={photos.length === 0}>
      <ul className="flex flex-wrap gap-4">
        {photos.map((photo) => (
          <li key={photo.version} className="grid gap-1">
            {/* a imagem vem dentro do arquivo, como `data:`: não há o que otimizar */}
            <img src={photo.image} alt={`Foto, versão ${photo.version}`} className="h-48 w-auto rounded border" />
            <span className="text-sm text-muted-foreground">
              Versão {photo.version} · {photo.isCurrent ? 'atual' : `guardada até ${instant(photo.expiresAt)}`} · enviada em{' '}
              {instant(photo.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** A versão para impressão da exportação de um aluno: as sete seções, na ordem do arquivo. */
export function StudentPrint({ data }: { data: StudentExport }) {
  const { student } = data;
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">Exportado em {instant(data.exportedAt)}</p>
      <Section id="print-personal" title="Dados pessoais">
        <Fields
          rows={[
            ['Nome', student.name],
            ['CPF', formatCpf(student.cpf)],
            ['Data de nascimento', day(student.birthDate)],
            ['Sexo', student.sex ? SEX_LABELS[student.sex] : NONE],
            ['E-mail', text(student.email)],
            ['Telefone', formatPhone(student.phone)],
            ['Endereço', text(student.address)],
            ['Contato de emergência', text(student.emergencyContactName)],
            ['Telefone de emergência', student.emergencyContactPhone ? formatPhone(student.emergencyContactPhone) : NONE],
            ['Observações de saúde', text(student.healthNotes)],
            ['Situação', STATUS_LABELS[student.status]],
            ['Cadastrado em', instant(student.createdAt)],
            ['Inativado em', instant(student.inactivatedAt)],
          ]}
        />
      </Section>
      <Section id="print-guardians" title="Responsáveis" empty={data.guardians.length === 0}>
        <Rows
          head={['Nome', 'CPF', 'Telefone', 'Parentesco', 'Cadastrado em']}
          rows={data.guardians.map((guardian) => [
            guardian.name,
            formatCpf(guardian.cpf),
            formatPhone(guardian.phone),
            RELATIONSHIP_LABELS[guardian.relationship],
            instant(guardian.createdAt),
          ])}
        />
      </Section>
      <Section id="print-consents" title="Consentimentos" empty={data.consents.length === 0}>
        <Rows
          head={['Finalidade', 'Versão do termo', 'Texto do termo', 'Concedido por', 'Concedido em', 'Revogado em']}
          rows={data.consents.map((consent) => [
            PURPOSE_LABELS[consent.purpose],
            String(consent.termVersion),
            consent.termText,
            GRANTOR_LABELS[consent.grantedBy],
            instant(consent.grantedAt),
            instant(consent.revokedAt),
          ])}
        />
      </Section>
      <Section id="print-enrollments" title="Matrículas" empty={data.enrollments.length === 0}>
        <Rows
          head={['Plano', 'Início', 'Vencimento', 'Valor', 'Cancelada em']}
          rows={data.enrollments.map((enrollment) => [
            enrollment.planName,
            day(enrollment.startsAt),
            day(enrollment.endsAt),
            formatPrice(enrollment.priceCents),
            instant(enrollment.cancelledAt),
          ])}
        />
      </Section>
      <Section id="print-payments" title="Pagamentos" empty={data.payments.length === 0}>
        <Rows
          head={['Período que começa em', 'Confirmado em', 'Desfeito em']}
          rows={data.payments.map((payment) => [day(payment.startsAt), instant(payment.createdAt), instant(payment.voidedAt)])}
        />
      </Section>
      <Section id="print-check-ins" title="Presenças" empty={data.checkIns.length === 0}>
        <Rows
          head={['Dia', 'Registrada em']}
          rows={data.checkIns.map((checkIn) => [day(checkIn.day), instant(checkIn.checkedInAt)])}
        />
      </Section>
      <Photos photos={data.photos} />
    </div>
  );
}

/** A versão para impressão da exportação de um funcionário: a ficha, o usuário vinculado e as fotos. */
export function StaffPrint({ data }: { data: StaffExport }) {
  const { staff, user } = data;
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">Exportado em {instant(data.exportedAt)}</p>
      <Section id="print-personal" title="Dados pessoais">
        <Fields
          rows={[
            ['Nome', staff.name],
            ['CPF', formatCpf(staff.cpf)],
            ['Cargo', staff.position],
            ['Setor', text(staff.department)],
            ['Data de admissão', day(staff.hiredAt)],
            ['Telefone', formatPhone(staff.phone)],
            ['E-mail', text(staff.email)],
            ['Situação', STATUS_LABELS[staff.status]],
            ['Cadastrado em', instant(staff.createdAt)],
          ]}
        />
      </Section>
      <Section id="print-user" title="Usuário">
        {user ? (
          <Fields
            rows={[
              ['E-mail do usuário', user.email],
              ['Perfil', ROLE_LABELS[user.role]],
            ]}
          />
        ) : (
          <p>Sem usuário vinculado.</p>
        )}
      </Section>
      <Photos photos={data.photos} />
    </div>
  );
}

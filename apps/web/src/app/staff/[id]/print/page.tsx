import { Button } from '@academia/ui';
import Link from 'next/link';
import { ExportLoadError, PrintButton } from '../../../../components/privacy/print-actions.tsx';
import { StaffPrint } from '../../../../components/privacy/print-view.tsx';
import { Shell } from '../../../../components/shell.tsx';
import { canUsePrivacy } from '../../../../lib/privacy.ts';
import { loadStaffExport } from '../../../../lib/privacy-server.ts';
import { requireSession } from '../../../../lib/session.ts';

export const dynamic = 'force-dynamic';

/** A versão para impressão da exportação (door 5): a mesma rota do download, montada em seções. */
export default async function StaffPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  // quem não exporta não chega a pedir; a API recusaria de qualquer forma
  const data = canUsePrivacy(session.user.role) ? await loadStaffExport(id) : 'forbidden';

  return (
    <Shell session={session}>
      {data === 'forbidden' ? (
        <p>Você não tem permissão para acessar esta página.</p>
      ) : data === 'failed' ? (
        <ExportLoadError />
      ) : data === 'notfound' ? (
        <p>Funcionário não encontrado.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">
              Dados do funcionário: {data.staff.name}
            </h2>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" asChild>
                <Link href={`/staff/${id}`} prefetch={false}>
                  Voltar à ficha
                </Link>
              </Button>
              <PrintButton />
            </div>
          </div>
          <StaffPrint data={data} />
        </>
      )}
    </Shell>
  );
}

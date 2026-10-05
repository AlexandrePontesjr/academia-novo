'use client';

import { problemSchema } from '@academia/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@academia/ui';
import { useRouter } from 'next/navigation';
import { type DragEvent, useRef, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';
import { StudentPhoto } from '../student-photo.tsx';

const ACCEPT = 'image/jpeg,image/png,image/webp';
/** Envio e processamento no servidor: o prazo é maior que o das chamadas comuns. */
const UPLOAD_TIMEOUT_MS = 30_000;
const GENERIC = 'Não foi possível enviar a foto. Tente novamente.';

/** O que a tela diz de cada resposta de erro do envio (AC 56). */
async function messageOf(response: Response): Promise<string> {
  if (response.status === 413) return 'A foto deve ter no máximo 5 MB.';
  if (response.status === 415) return 'Use um arquivo JPEG, PNG ou WebP.';
  if (response.status === 409) return 'Este aluno já tem foto.';
  if (response.status === 422) {
    const problem = problemSchema.safeParse(await response.json().catch(() => undefined));
    const file = problem.success ? problem.data.errors?.find((error) => error.path === 'file') : undefined;
    if (file) return file.message;
  }
  return GENERIC;
}

/**
 * A foto da ficha: a imagem ou as iniciais para os quatro perfis, e, para quem escreve, o envio por
 * arquivo ou arrastar e soltar (sem foto) e a remoção com confirmação (com foto).
 */
export function PhotoBlock({
  studentId,
  name,
  photoUrl,
  canWrite,
}: {
  studentId: string;
  name: string;
  photoUrl: string | null | undefined;
  canWrite: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [alert, setAlert] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setAlert(undefined);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/students/${studentId}/photo`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (response.status === 201) {
        router.refresh();
        return;
      }
      setAlert(await messageOf(response));
    } catch {
      setAlert(GENERIC);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    return upload(event.dataTransfer.files[0]);
  }

  async function remove() {
    setRemoving(true);
    setAlert(undefined);
    const result = await callApi('DELETE', `/api/students/${studentId}/photo`);
    setRemoving(false);
    if (result.kind === 'ok') {
      setAsking(false);
      router.refresh();
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível remover a foto. Tente novamente.');
  }

  return (
    <div className="grid gap-3">
      <StudentPhoto name={name} photoUrl={photoUrl} shape="ficha" />
      {canWrite && !photoUrl && (
        <div
          data-photo-dropzone
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
          className="grid max-w-sm justify-items-start gap-2 rounded-md border border-dashed p-4"
        >
          <p className="text-sm text-muted-foreground">Arraste uma foto aqui ou escolha um arquivo</p>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? 'Enviando…' : 'Enviar foto'}
          </Button>
        </div>
      )}
      {canWrite && photoUrl && (
        <div>
          <Button variant="outline" onClick={() => setAsking(true)}>
            Remover foto
          </Button>
        </div>
      )}
      {alert && !asking && <Alert variant="destructive">{alert}</Alert>}

      <Dialog open={asking} onOpenChange={(open) => !open && !removing && (setAsking(false), setAlert(undefined))}>
        <DialogContent>
          <DialogTitle>Remover foto</DialogTitle>
          <DialogDescription>
            A foto de {name} será apagada do servidor. Depois, outra foto pode ser enviada.
          </DialogDescription>
          {alert && <Alert variant="destructive">{alert}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" disabled={removing} onClick={remove}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

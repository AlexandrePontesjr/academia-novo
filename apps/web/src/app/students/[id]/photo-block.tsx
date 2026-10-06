'use client';

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
import { type DragEvent, useEffect, useRef, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';
import { fits, loadImage } from '../../../lib/photo-crop.ts';
import { StudentPhoto } from '../student-photo.tsx';
import { PhotoEditor, TOO_SMALL, UNREADABLE } from './photo-editor.tsx';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * A foto da ficha: a imagem ou as iniciais para os quatro perfis, e, para quem escreve, o arquivo
 * escolhido ou largado (sem foto) e "Trocar foto" e a remoção com confirmação (com foto). Nenhum
 * arquivo sai do navegador sem passar pelo ajuste do `PhotoEditor`.
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
  const [editing, setEditing] = useState<HTMLImageElement>();
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => () => void (editing && URL.revokeObjectURL(editing.src)), [editing]);

  /** Abre o ajuste com o arquivo, ou diz por que ele não serve. */
  async function open(file: Blob | undefined) {
    if (!file) return;
    setAlert(undefined);
    const image = await loadImage(file);
    if (!image) return setAlert(UNREADABLE);
    if (!fits(image, 0) && !fits(image, 90)) {
      URL.revokeObjectURL(image.src);
      return setAlert(TOO_SMALL);
    }
    setEditing(image);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    return open(event.dataTransfer.files[0]);
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
          <Button type="button" variant="outline" onClick={() => input.current?.click()}>
            Enviar foto
          </Button>
        </div>
      )}
      {canWrite && photoUrl && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => input.current?.click()}>
            Trocar foto
          </Button>
          <Button variant="outline" onClick={() => setAsking(true)}>
            Remover foto
          </Button>
        </div>
      )}
      {canWrite && (
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // o mesmo arquivo, escolhido de novo, precisa disparar outra mudança
            event.target.value = '';
            void open(file);
          }}
        />
      )}
      {alert && !asking && <Alert variant="destructive">{alert}</Alert>}

      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && !sending && setEditing(undefined)}>
        <DialogContent aria-describedby={undefined} onInteractOutside={(event) => event.preventDefault()}>
          {editing && (
            <PhotoEditor
              image={editing}
              method={photoUrl ? 'PUT' : 'POST'}
              url={`/api/students/${studentId}/photo`}
              sending={sending}
              onSending={setSending}
              onSaved={() => {
                setEditing(undefined);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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

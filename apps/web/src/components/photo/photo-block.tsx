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
import { callApi, UNAVAILABLE } from '../../lib/api.ts';
import { fits, loadImage } from '../../lib/photo-crop.ts';
import { PersonPhoto } from './person-photo.tsx';
import { PhotoCamera } from './photo-camera.tsx';
import { PhotoEditor, TOO_SMALL, UNREADABLE } from './photo-editor.tsx';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** O que o diálogo de captura e recorte mostra: a imagem ao vivo, ou o ajuste de uma imagem. */
type Flow = { step: 'camera' } | { step: 'edit'; image: HTMLImageElement; fromCamera: boolean };

/**
 * A foto da ficha de um aluno ou de um funcionário: a imagem ou as iniciais, e, para quem escreve,
 * o arquivo escolhido ou largado (sem foto), "Trocar foto" e a remoção com confirmação (com foto) e
 * "Usar câmera" nos dois casos. Nenhuma imagem sai do navegador sem passar pelo ajuste do
 * `PhotoEditor`.
 */
export function PhotoBlock({
  url,
  conflict,
  name,
  photoUrl,
  canWrite,
}: {
  /** A rota de foto do dono: `/api/students/<id>/photo` ou `/api/staff/<id>/photo`. */
  url: string;
  /** O que a tela diz quando o envio responde `409`: a pessoa já tem foto. */
  conflict: string;
  name: string;
  photoUrl: string | null | undefined;
  canWrite: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [flow, setFlow] = useState<Flow>();
  const editing = flow?.step === 'edit' ? flow.image : undefined;
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => () => void (editing && URL.revokeObjectURL(editing.src)), [editing]);

  /** Abre o ajuste com o arquivo ou com o quadro capturado, ou diz por que ele não serve. */
  async function open(file: Blob | undefined, fromCamera = false) {
    if (!file) return;
    setAlert(undefined);
    const image = await loadImage(file);
    const refusal = !image ? UNREADABLE : !fits(image, 0) && !fits(image, 90) ? TOO_SMALL : undefined;
    if (!image || refusal) {
      if (image) URL.revokeObjectURL(image.src);
      setFlow(undefined);
      return setAlert(refusal);
    }
    setFlow({ step: 'edit', image, fromCamera });
  }

  const cameraButton = (
    <Button type="button" variant="outline" onClick={() => (setAlert(undefined), setFlow({ step: 'camera' }))}>
      Usar câmera
    </Button>
  );

  function drop(event: DragEvent) {
    event.preventDefault();
    return open(event.dataTransfer.files[0]);
  }

  async function remove() {
    setRemoving(true);
    setAlert(undefined);
    const result = await callApi('DELETE', url);
    setRemoving(false);
    if (result.kind === 'ok') {
      setAsking(false);
      router.refresh();
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível remover a foto. Tente novamente.');
  }

  return (
    <div className="grid gap-3">
      <PersonPhoto name={name} photoUrl={photoUrl} shape="ficha" />
      {canWrite && !photoUrl && (
        <div
          data-photo-dropzone
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
          className="grid max-w-sm justify-items-start gap-2 rounded-md border border-dashed p-4"
        >
          <p className="text-sm text-muted-foreground">Arraste uma foto aqui ou escolha um arquivo</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => input.current?.click()}>
              Enviar foto
            </Button>
            {cameraButton}
          </div>
        </div>
      )}
      {canWrite && photoUrl && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => input.current?.click()}>
            Trocar foto
          </Button>
          {cameraButton}
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

      <Dialog open={flow !== undefined} onOpenChange={(open) => !open && !sending && setFlow(undefined)}>
        <DialogContent aria-describedby={undefined} onInteractOutside={(event) => event.preventDefault()}>
          {flow?.step === 'camera' && <PhotoCamera onCapture={(frame) => open(frame, true)} />}
          {flow?.step === 'edit' && (
            <PhotoEditor
              image={flow.image}
              method={photoUrl ? 'PUT' : 'POST'}
              url={url}
              conflict={conflict}
              sending={sending}
              onSending={setSending}
              onSaved={() => {
                setFlow(undefined);
                router.refresh();
              }}
              onRetake={flow.fromCamera ? () => setFlow({ step: 'camera' }) : undefined}
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

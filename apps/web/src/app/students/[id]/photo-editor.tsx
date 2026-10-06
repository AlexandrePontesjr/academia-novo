'use client';

import { problemSchema } from '@academia/contracts';
import { Alert, Button, DialogClose, DialogFooter, DialogTitle } from '@academia/ui';
import { useState } from 'react';
import Cropper from 'react-easy-crop';
import { ASPECT, drawRegion, fits, maxZoomOf, type Region } from '../../../lib/photo-crop.ts';

/** Envio e processamento no servidor: o prazo é maior que o das chamadas comuns. */
const UPLOAD_TIMEOUT_MS = 30_000;
const GENERIC = 'Não foi possível enviar a foto. Tente novamente.';
export const TOO_SMALL = 'A foto precisa ter pelo menos 300×400 pixels.';
export const UNREADABLE = 'Use um arquivo JPEG, PNG ou WebP.';

/** O que a tela diz de cada resposta de erro do envio (AC 56 da foto-pipeline). */
async function messageOf(response: Response): Promise<string> {
  if (response.status === 413) return 'A foto deve ter no máximo 5 MB.';
  if (response.status === 415) return UNREADABLE;
  if (response.status === 409) return 'Este aluno já tem foto.';
  if (response.status === 422) {
    const problem = problemSchema.safeParse(await response.json().catch(() => undefined));
    const file = problem.success ? problem.data.errors?.find((error) => error.path === 'file') : undefined;
    if (file) return file.message;
  }
  return GENERIC;
}

/**
 * O ajuste da foto antes do envio (door 6): quadro fixo 3:4, zoom e giro de 90°. "Salvar foto"
 * desenha a região enquadrada num JPEG e o envia como a parte `file`; um erro do envio fica aqui
 * dentro, com o enquadramento como estava.
 */
export function PhotoEditor({
  image,
  method,
  url,
  sending,
  onSending,
  onSaved,
  onRetake,
}: {
  image: HTMLImageElement;
  /** `POST` para o aluno sem foto, `PUT` para trocar a que ele tem (door 2). */
  method: 'POST' | 'PUT';
  url: string;
  sending: boolean;
  onSending: (sending: boolean) => void;
  onSaved: () => void;
  /** Só para a foto que veio da câmera: volta à imagem ao vivo. */
  onRetake?: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [region, setRegion] = useState<Region>();
  const [error, setError] = useState<string>();
  const maxZoom = maxZoomOf(image, rotation);
  const usable = fits(image, rotation);

  function rotate(degrees: number) {
    const next = rotation + degrees;
    setRotation(next);
    setZoom(Math.min(zoom, maxZoomOf(image, next)));
    setCrop({ x: 0, y: 0 });
  }

  async function save() {
    if (!region || sending) return;
    onSending(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append('file', await drawRegion(image, region, rotation), 'foto.jpg');
      const response = await fetch(url, { method, body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
      if (response.status === 201) {
        onSaved();
        return;
      }
      setError(await messageOf(response));
    } catch {
      setError(GENERIC);
    } finally {
      onSending(false);
    }
  }

  return (
    <>
      <DialogTitle>Ajustar foto</DialogTitle>
      <div className="relative mx-auto h-80 w-60 overflow-hidden rounded-md bg-muted">
        <Cropper
          image={image.src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={ASPECT}
          minZoom={1}
          maxZoom={maxZoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropAreaChange={(_, pixels) => setRegion(pixels)}
        />
      </div>
      <label className="grid gap-1 text-sm">
        Zoom
        <input
          type="range"
          min={1}
          max={maxZoom}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => rotate(-90)}>
          Girar à esquerda
        </Button>
        <Button type="button" variant="outline" onClick={() => rotate(90)}>
          Girar à direita
        </Button>
      </div>
      {/* deitada ou em pé, a imagem pode comportar os 300×400 só num dos giros */}
      {!usable && <Alert variant="destructive">{TOO_SMALL}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" disabled={sending}>
            Cancelar
          </Button>
        </DialogClose>
        {onRetake && (
          <Button variant="outline" disabled={sending} onClick={onRetake}>
            Tirar outra
          </Button>
        )}
        <Button disabled={sending || !region || !usable} onClick={save}>
          {sending ? 'Enviando…' : 'Salvar foto'}
        </Button>
      </DialogFooter>
    </>
  );
}

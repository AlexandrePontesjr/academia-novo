'use client';

import type { PendingPhoto } from '@academia/contracts';
import { Alert, Button, Dialog, DialogContent } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PersonPhoto } from '../../components/photo/person-photo.tsx';
import { PhotoEditor, TOO_SMALL, UNREADABLE } from '../../components/photo/photo-editor.tsx';
import { fits, loadImage } from '../../lib/photo-crop.ts';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * A foto do aluno: a corrente e, enquanto a recepção não responde, a pendente sem o botão de envio
 * (AC 52). A foto nova passa pelo recorte 3:4 e só substitui a corrente quando for aprovada.
 */
export function MyPhoto({ name, photoUrl, pending }: { name: string; photoUrl: string | null; pending: PendingPhoto | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement>();
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<string>();

  useEffect(() => () => void (image && URL.revokeObjectURL(image.src)), [image]);

  async function open(file: File | undefined) {
    if (!file) return;
    setAlert(undefined);
    const loaded = await loadImage(file);
    const refusal = !loaded ? UNREADABLE : !fits(loaded, 0) && !fits(loaded, 90) ? TOO_SMALL : undefined;
    if (!loaded || refusal) {
      if (loaded) URL.revokeObjectURL(loaded.src);
      return setAlert(refusal);
    }
    setImage(loaded);
  }

  return (
    <div className="grid justify-items-start gap-3">
      <div className="flex flex-wrap gap-6">
        <PersonPhoto name={name} photoUrl={photoUrl} shape="ficha" />
        {pending && (
          <div className="grid justify-items-start gap-2">
            {pending.url && <img src={pending.url} alt="Foto aguardando aprovação" className="h-32 w-24 rounded-md object-cover md:h-40 md:w-30" />}
            <p className="text-sm text-muted-foreground">Aguardando aprovação da recepção.</p>
          </div>
        )}
      </div>
      {!pending && (
        <>
          <Button type="button" variant="outline" onClick={() => input.current?.click()}>
            Enviar foto
          </Button>
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
        </>
      )}
      {alert && <Alert variant="destructive">{alert}</Alert>}

      <Dialog open={image !== undefined} onOpenChange={(open) => !open && !sending && setImage(undefined)}>
        <DialogContent aria-describedby={undefined} onInteractOutside={(event) => event.preventDefault()}>
          {image && (
            <PhotoEditor
              image={image}
              method="POST"
              url="/api/me/photo"
              conflict="Você já enviou uma foto que aguarda aprovação da recepção."
              sending={sending}
              onSending={setSending}
              onSaved={() => {
                setImage(undefined);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

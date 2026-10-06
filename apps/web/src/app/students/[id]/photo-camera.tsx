'use client';

import { Alert, Button, DialogClose, DialogFooter, DialogTitle } from '@academia/ui';
import { useEffect, useRef, useState } from 'react';

const DENIED = 'Permita o uso da câmera no navegador ou envie um arquivo.';
const NO_CAMERA = 'Nenhuma câmera disponível neste dispositivo. Envie um arquivo.';

type Phase = 'opening' | 'live' | 'denied' | 'none';

/**
 * A imagem ao vivo da câmera (foto-captura, S5): só vídeo, sem áudio. "Capturar" entrega o quadro
 * a quem abre o ajuste. Toda trilha aberta é encerrada quando a imagem ao vivo sai da tela, seja
 * por captura, cancelamento, fechamento ou troca de câmera.
 */
export function PhotoCamera({ onCapture }: { onCapture: (frame: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('opening');
  const [stream, setStream] = useState<MediaStream>();
  /** A câmera pedida; sem valor, a que o navegador entrega por padrão. */
  const [deviceId, setDeviceId] = useState<string>();
  const [cameras, setCameras] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // fora de contexto seguro (HTTP por IP da rede) o navegador nem oferece a câmera
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (!devices?.getUserMedia) {
      setPhase('none');
      return;
    }
    let left = false;
    let opened: MediaStream | undefined;
    const stop = (media: MediaStream) => media.getTracks().forEach((track) => track.stop());
    devices
      .getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then(async (media) => {
        if (left) return stop(media);
        opened = media;
        setStream(media);
        setPhase('live');
        const inputs = (await devices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
        if (!left) setCameras(inputs.map((device) => device.deviceId));
      })
      .catch((error: unknown) => {
        if (!left) setPhase(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'none');
      });
    return () => {
      left = true;
      if (opened) stop(opened);
    };
  }, [deviceId]);

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  function switchCamera() {
    const current = deviceId ?? stream?.getVideoTracks()[0]?.getSettings().deviceId;
    const at = Math.max(0, cameras.indexOf(current ?? ''));
    setPhase('opening');
    setReady(false);
    setDeviceId(cameras[(at + 1) % cameras.length]);
  }

  function capture() {
    const element = video.current;
    if (!element) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext('2d')!.drawImage(element, 0, 0);
    canvas.toBlob((frame) => frame && onCapture(frame), 'image/png');
  }

  return (
    <>
      <DialogTitle>Tirar foto</DialogTitle>
      {phase === 'opening' && <p className="text-sm text-muted-foreground">Abrindo câmera…</p>}
      {phase === 'denied' && <Alert variant="destructive">{DENIED}</Alert>}
      {phase === 'none' && <Alert variant="destructive">{NO_CAMERA}</Alert>}
      {phase === 'live' && (
        <>
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={() => setReady(true)}
            className="mx-auto max-h-80 w-full rounded-md bg-muted"
          />
          <p className="text-sm text-muted-foreground">Enquadre o rosto e os ombros</p>
        </>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        {phase === 'live' && cameras.length > 1 && (
          <Button variant="outline" onClick={switchCamera}>
            Trocar câmera
          </Button>
        )}
        {phase === 'live' && (
          <Button disabled={!ready} onClick={capture}>
            Capturar
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

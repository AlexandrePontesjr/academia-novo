import busboy from 'busboy';
import type { Request } from 'express';
import { ProblemException, validationProblem } from '../problem.filter.ts';

/** 5 MiB, 5 242 880 bytes (RF-13): o limite da parte `file`, e o que `413` recusa um byte acima. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Quanto do corpo se lê para chegar a recusar com `413`: depois disto a conexão cai. */
const MAX_BODY_BYTES = 4 * MAX_FILE_BYTES;

const FILE_PART = 'file';
const MAX_PARTS = 10;

const noFile = () => validationProblem([{ path: 'file', message: 'Envie uma única foto, na parte "file".' }]);

/**
 * Lê a parte `file` de um corpo `multipart/form-data` com o teto de 5 MiB, na memória e sem tocar o
 * disco (AC 20): o arquivo enviado não deixa rastro. Não confia em `Content-Length`: o limite vale
 * para os bytes que chegam, também em partes. Uma parte `file` sem nome de arquivo conta como o
 * arquivo - quem decide é o conteúdo, nunca o nome nem o tipo declarado.
 */
export function readFilePart(req: Request): Promise<Buffer> {
  if (!req.is('multipart/form-data')) {
    return Promise.reject(new ProblemException(415, 'unsupported_media_type'));
  }
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      // `latin1` lê cada byte como um caractere: o valor de um campo sem nome de arquivo volta inteiro
      // o Busboy dispara `limit` ao chegar ao teto, não ao passar dele: o teto dele é um byte acima do nosso
      parser = busboy({
        headers: req.headers,
        defCharset: 'latin1',
        limits: { fileSize: MAX_FILE_BYTES + 1, fieldSize: MAX_FILE_BYTES + 1, files: MAX_PARTS, fields: MAX_PARTS, parts: MAX_PARTS },
      });
    } catch {
      reject(noFile());
      return;
    }

    const found: Buffer[] = [];
    let tooLarge = false;
    let malformed = false;
    let received = 0;

    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        tooLarge = true;
        req.unpipe(parser);
        req.destroy();
        finish();
      }
    });

    parser.on('file', (name, stream) => {
      if (name !== FILE_PART) {
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => (tooLarge = true));
      stream.on('end', () => found.push(Buffer.concat(chunks)));
    });
    parser.on('field', (name, value, info) => {
      if (name !== FILE_PART) return;
      if (info.valueTruncated) tooLarge = true;
      found.push(Buffer.from(value, 'latin1'));
    });
    req.on('error', () => {
      malformed = true;
      finish();
    });
    parser.on('partsLimit', () => (malformed = true));
    parser.on('filesLimit', () => (malformed = true));
    parser.on('fieldsLimit', () => (malformed = true));
    parser.on('error', () => {
      malformed = true;
      finish();
    });

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      if (tooLarge) reject(new ProblemException(413, 'payload_too_large'));
      else if (malformed || found.length !== 1) reject(noFile());
      else resolve(found[0]!);
    }
    parser.on('close', finish);

    req.pipe(parser);
  });
}

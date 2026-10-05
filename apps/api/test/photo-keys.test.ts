import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { photoKey } from '../src/photos/photo-keys.ts';

test('key_shape_for_three_variants_and_rejects_foreign_segments', () => {
  const studentId = randomUUID();
  const photoId = randomUUID();

  for (const variant of ['thumb', 'medium', 'large']) {
    expect(photoKey(studentId, photoId, variant), variant).toBe(`photos/main/${studentId}/${photoId}/${variant}.webp`);
  }

  for (const variant of ['original', 'THUMB', '../large', '']) {
    expect(() => photoKey(studentId, photoId, variant), `variante ${JSON.stringify(variant)}`).toThrow();
  }
  for (const segment of ['a/b', '..', '']) {
    expect(() => photoKey(segment, photoId, 'thumb'), `studentId ${JSON.stringify(segment)}`).toThrow();
    expect(() => photoKey(studentId, segment, 'thumb'), `photoId ${JSON.stringify(segment)}`).toThrow();
  }
});

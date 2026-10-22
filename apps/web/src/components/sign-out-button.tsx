'use client';

import { Button } from '@academia/ui';
import { useState } from 'react';
import { callApi } from '../lib/api.ts';

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await callApi('POST', '/api/auth/logout');
    // com a sessão encerrada, ou já sem ela, o destino é o mesmo
    window.location.assign('/login');
  }

  return (
    <Button variant="outline" size="sm" busy={pending} onClick={signOut}>
      Sair
    </Button>
  );
}

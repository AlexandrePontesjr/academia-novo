'use client';

import { Alert, Button, Label, Select } from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';

export interface LinkableUser {
  id: string;
  name: string;
  email: string;
}

/**
 * O campo "Usuário vinculado" da ficha, só para o Administrador: escolher um usuário e salvar liga
 * a ficha a ele; escolher "Nenhum" e salvar desfaz o vínculo, sem diálogo (o vínculo se refaz aqui).
 */
export function UserLink({
  staffId,
  current,
  users,
}: {
  staffId: string;
  current: string | null;
  users: LinkableUser[];
}) {
  const router = useRouter();
  const selectId = useId();
  const [value, setValue] = useState(current ?? '');
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string>();

  async function save() {
    setPending(true);
    setAlert(undefined);
    const result = value
      ? await callApi('PUT', `/api/staff/${staffId}/user`, { userId: value })
      : await callApi('DELETE', `/api/staff/${staffId}/user`);
    setPending(false);
    if (result.kind === 'ok') router.refresh();
    else if (result.kind === 'problem' && result.code === 'user_already_linked') {
      setAlert('Este usuário já está vinculado a outro funcionário.');
    } else setAlert(result.kind === 'unavailable' ? UNAVAILABLE : 'Não foi possível salvar o vínculo. Tente novamente.');
  }

  return (
    <div className="grid max-w-md gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={selectId}>Usuário vinculado</Label>
        <Select id={selectId} value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">Nenhum</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.email})
            </option>
          ))}
        </Select>
      </div>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <div>
        <Button variant="outline" disabled={pending} onClick={save}>
          Salvar vínculo
        </Button>
      </div>
    </div>
  );
}

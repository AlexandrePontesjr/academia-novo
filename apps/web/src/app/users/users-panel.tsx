'use client';

import {
  type CreateUserRequest,
  createUserRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  USER_ROLES,
  type User,
} from '@academia/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Label,
  Select,
  Table,
  TableCell,
  TableHead,
  TableRow,
} from '@academia/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '../../components/text-field.tsx';
import { type ApiResult, callApi, showFieldErrors, UNAVAILABLE } from '../../lib/api.ts';
import { ROLE_LABELS } from '../../lib/roles.ts';

type Action = { kind: 'deactivate' | 'resetPassword' | 'resetTwoFactor'; user: User };

/** O texto de uma recusa que não é de campo. */
function refusal(result: Exclude<ApiResult<unknown>, { kind: 'ok' | 'validation' }>) {
  if (result.kind === 'unavailable') return UNAVAILABLE;
  if (result.code === 'last_admin') return 'O sistema não pode ficar sem nenhum administrador ativo.';
  return 'Não foi possível concluir. Tente novamente.';
}

export function UsersPanel({ users }: { users: User[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action>();
  const done = () => {
    setCreating(false);
    setAction(undefined);
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      <div>
        <Button onClick={() => setCreating(true)}>Novo usuário</Button>
      </div>
      <Table>
        <thead>
          <tr>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>2FA</TableHead>
            <TableHead>
              <span className="sr-only">Ações</span>
            </TableHead>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{ROLE_LABELS[user.role]}</TableCell>
              <TableCell>{user.active ? 'Ativo' : 'Inativo'}</TableCell>
              <TableCell>{user.twoFactorEnabled ? 'Ativado' : 'Desativado'}</TableCell>
              <TableCell className="flex flex-wrap gap-2">
                {user.active && (
                  <Button variant="outline" size="sm" onClick={() => setAction({ kind: 'deactivate', user })}>
                    Desativar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setAction({ kind: 'resetPassword', user })}>
                  Redefinir senha
                </Button>
                {user.twoFactorEnabled && (
                  <Button variant="outline" size="sm" onClick={() => setAction({ kind: 'resetTwoFactor', user })}>
                    Zerar 2FA
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>A pessoa entra com o e-mail e a senha informados aqui.</DialogDescription>
          <CreateUserForm onCreated={done} />
        </DialogContent>
      </Dialog>

      <Dialog open={action !== undefined} onOpenChange={(open) => !open && setAction(undefined)}>
        <DialogContent>
          {action?.kind === 'resetPassword' && <ResetPasswordForm user={action.user} onDone={done} />}
          {action?.kind === 'deactivate' && (
            <Confirmation
              title="Desativar usuário"
              description={`${action.user.name} não poderá mais entrar, e as sessões abertas serão encerradas.`}
              confirm="Desativar"
              send={() => callApi('PATCH', `/api/users/${action.user.id}`, { active: false })}
              onDone={done}
            />
          )}
          {action?.kind === 'resetTwoFactor' && (
            <Confirmation
              title="Zerar 2FA"
              description={`A verificação em duas etapas de ${action.user.name} será apagada, e as sessões abertas serão encerradas.`}
              confirm="Zerar 2FA"
              send={() => callApi('DELETE', `/api/users/${action.user.id}/two-factor`)}
              onDone={done}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Diálogo de uma ação destrutiva: nomeia o usuário e só envia depois da confirmação. */
function Confirmation(props: {
  title: string;
  description: string;
  confirm: string;
  send: () => Promise<ApiResult<unknown>>;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string>();

  async function confirm() {
    setPending(true);
    setAlert(undefined);
    const result = await props.send();
    setPending(false);
    if (result.kind === 'ok') props.onDone();
    else if (result.kind !== 'validation') setAlert(refusal(result));
  }

  return (
    <>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogDescription>{props.description}</DialogDescription>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <Button variant="destructive" busy={pending} onClick={confirm}>
          {props.confirm}
        </Button>
      </DialogFooter>
    </>
  );
}

function ResetPasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [alert, setAlert] = useState<string>();
  const form = useForm<ResetPasswordRequest>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: ResetPasswordRequest) {
    setAlert(undefined);
    const result = await callApi('PUT', `/api/users/${user.id}/password`, values);

    if (result.kind === 'ok') onDone();
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else setAlert(refusal(result));
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      <DialogTitle>Redefinir senha</DialogTitle>
      <DialogDescription>
        Defina a nova senha de {user.name}. As sessões abertas serão encerradas.
      </DialogDescription>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        registration={form.register('password')}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          Redefinir senha
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const roleId = useId();
  const [alert, setAlert] = useState<string>();
  const form = useForm<CreateUserRequest>({
    resolver: zodResolver(createUserRequestSchema),
    defaultValues: { name: '', email: '', role: 'reception', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: CreateUserRequest) {
    setAlert(undefined);
    const result = await callApi<User>('POST', '/api/users', values);

    if (result.kind === 'ok') onCreated();
    else if (result.kind === 'validation') showFieldErrors(form, result.errors);
    else if (result.kind === 'problem' && result.code === 'email_taken') {
      form.setError('email', { message: 'E-mail já cadastrado.' });
    } else setAlert(refusal(result));
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
      {alert && <Alert variant="destructive">{alert}</Alert>}
      <TextField label="Nome" error={errors.name?.message} registration={form.register('name')} />
      <TextField
        label="E-mail"
        type="email"
        autoComplete="off"
        error={errors.email?.message}
        registration={form.register('email')}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={roleId}>Perfil</Label>
        <Select
          id={roleId}
          aria-invalid={errors.role ? true : undefined}
          aria-describedby={errors.role ? `${roleId}-error` : undefined}
          {...form.register('role')}
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
        {errors.role && (
          <p id={`${roleId}-error`} className="text-sm text-[#f87171]">
            {errors.role.message}
          </p>
        )}
      </div>
      <TextField
        label="Senha"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        registration={form.register('password')}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          Criar usuário
        </Button>
      </DialogFooter>
    </form>
  );
}

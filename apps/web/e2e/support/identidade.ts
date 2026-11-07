/* A tela e os valores que a prova da identidade e a da dukfit-app leem (identidade-visual, dukfit-app, refino visual). */
import type { MyProfile, Role } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import { historyItemOf, listItemOf, reportItemOf, reportOf, statusOf, statusPath } from './check-ins.ts';
import { serveDashboard } from './dashboard.ts';
import { type FakeApi, sessionOf, userOf } from './fake-api.ts';
import { enrollmentOf, planOf, serveFicha, servePlans, STUDENT_ID, studentOf, stateOf } from './plans.ts';
import { openPaymentOf, paymentsStateOf, periodOf, serveOpenPayments, servePayments } from './payments.ts';
import { attachment, staffExportOf, staffExportPath, studentExportOf, studentExportPath } from './privacy.ts';
import { serveStaffAs, staffOf, STAFF_ID } from './staff.ts';

export const DARK = 'rgb(0, 0, 0)';
export const LIGHT = 'rgb(250, 250, 250)';
export const CARD = 'rgb(15, 15, 15)';
export const HEADER = 'rgb(26, 26, 26)';
export const BORDER = 'rgb(38, 38, 38)';
export const INPUT = 'rgb(42, 42, 42)';
/** A borda de controle do refino visual (`--border-control`), 3:1 contra o cartão. */
export const BORDER_CONTROL = 'rgb(107, 107, 107)';
export const LIME = 'rgb(252, 244, 60)';
export const RED = 'rgb(220, 38, 38)';
export const DANGER = 'rgb(248, 113, 113)';

export const PLAN_ID = planOf().id;
export const STUDENT = studentOf();
export const STAFF = staffOf();
export const ONE_ENROLLMENT = enrollmentOf();
export const ONE_PERIOD = periodOf();

/** O aluno do portal (a sessão `student`), com o perfil e os pagamentos servidos pela API falsa. */
export const PORTAL_NAME = 'Ana Souza';
export const PORTAL_PROFILE: MyProfile = {
  name: PORTAL_NAME,
  cpf: '52998224725',
  birthDate: '2000-01-01',
  email: 'ana@exemplo.com',
  phone: '11912345678',
  address: 'Rua das Flores, 10',
  emergencyContactName: 'Bia Lima',
  emergencyContactPhone: '11933334444',
  status: 'active',
  photoUrl: null,
  pendingPhoto: null,
};

/** Alimenta a API falsa com tudo o que as 26 telas leem, para um perfil. */
export function serveWorld(api: FakeApi, role: Role) {
  servePlans(api, stateOf({ plans: [planOf()], enrollments: { [STUDENT_ID]: [ONE_ENROLLMENT] } }));
  serveFicha(api, role, STUDENT, stateOf({ plans: [planOf()], enrollments: { [STUDENT_ID]: [ONE_ENROLLMENT] } }));
  servePayments(api, STUDENT_ID, paymentsStateOf({ periods: { [STUDENT_ID]: [ONE_PERIOD] } }));
  serveStaffAs(api, role, { staff: [STAFF], users: [userOf(1)] });
  serveOpenPayments(api, role, [openPaymentOf()]);
  serveDashboard(api, role);

  api.on('GET', '/api/students', {
    status: 200,
    body: { items: [listItemOf(1), listItemOf(2)], nextCursor: null },
  });
  api.on('GET', `/api/students/${STUDENT_ID}/check-ins`, {
    status: 200,
    body: { items: [historyItemOf(1)], nextCursor: null },
  });
  api.on('GET', statusPath(STUDENT_ID), { status: 200, body: statusOf(STUDENT_ID) });
  api.on('GET', studentExportPath, attachment(studentExportOf(), `aluno-${STUDENT_ID}.json`));
  api.on('GET', staffExportPath, attachment(staffExportOf(), `funcionario-${STAFF_ID}.json`));
  api.on('GET', '/api/check-ins', { status: 200, body: reportOf({ total: 1, items: [reportItemOf(2)] }) });
  api.on('GET', '/api/audit-logs', { status: 200, body: { items: [], nextCursor: null } });
  api.on('GET', '/api/leads', { status: 200, body: { items: [] } });
  api.on('GET', '/api/privacy-settings', {
    status: 200,
    body: { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 30 },
  });
  // a área do aluno: o perfil e os períodos da sessão `student` (portal-aluno)
  api.on('GET', '/api/me/profile', { status: 200, body: PORTAL_PROFILE });
  api.on('GET', '/api/me/payments', { status: 200, body: { items: [] } });
  api.session = sessionOf(role);
}

/** O CSS computado de um elemento, com o valor cru e o sRGB resolvido (o Chromium serializa `oklch`). */
export async function styleOf(locator: Locator, property: string, pseudo?: string) {
  return locator.evaluate(
    (element, args) => {
      const style = getComputedStyle(element, args.pseudo ?? null);
      const raw = style.getPropertyValue(args.property);
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = raw;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return { raw, rgb: `rgb(${r}, ${g}, ${b})` };
    },
    { property, pseudo },
  );
}

export const flat = (value: string) => value.replace(/\s+/g, ' ').trim();

export interface Screen {
  path: string;
  /** `false` nas telas sem o shell (login, 2FA e o portal do aluno). */
  shell: boolean;
  /** `true` na tela do portal, que abre com a sessão `student`. */
  student?: boolean;
  /** Os h1/h2/h3 de `main`, na ordem do DOM (o h1 do shell fica no header). */
  headings: string[];
  columns?: string[];
  labels?: string[];
  texts?: string[];
}

export const SCREENS: Screen[] = [
  {
    path: '/login',
    shell: false,
    headings: ['Bem-vindo de volta'],
    labels: ['E-mail', 'Senha'],
    texts: ['Entrar'],
  },
  {
    path: '/login/two-factor',
    shell: false,
    headings: ['Verificação em duas etapas'],
    labels: ['Código de 6 dígitos'],
    texts: ['Verificar', 'Usar código de recuperação'],
  },
  {
    path: '/two-factor/setup',
    shell: false,
    headings: ['Ativar verificação em duas etapas'],
    labels: ['Senha'],
    texts: ['Confirme sua senha para gerar o QR code.'],
  },
  {
    path: '/minha-conta',
    shell: false,
    student: true,
    headings: [PORTAL_NAME, 'Foto', 'Meus dados', 'Pagamentos'],
    labels: ['Telefone', 'Endereço', 'Contato de emergência (nome)', 'Contato de emergência (telefone)'],
    texts: ['Minha conta', 'Você ainda não tem matrícula registrada.', 'Sair'],
  },
  {
    path: '/dashboard',
    shell: true,
    headings: [
      'Painel',
      'Alunos',
      'Check-ins de hoje',
      'Check-ins da semana',
      'Matrículas',
      'Vencimentos nos próximos 7 dias',
      'Pagamentos',
      'Matrículas ativas por plano',
    ],
    columns: ['Aluno', 'Plano', 'Vence em', 'Plano', 'Matrículas ativas'],
    texts: ['Olá, Marina Duarte.'],
  },
  {
    path: '/students',
    shell: true,
    headings: ['Alunos'],
    columns: ['Nome', 'CPF', 'Telefone', 'Situação'],
    labels: ['Buscar por nome, CPF ou telefone', 'Situação'],
    texts: ['Novo aluno', 'Filtrar', 'Limpar', '2 resultados'],
  },
  {
    path: '/students/new',
    shell: true,
    headings: ['Novo aluno'],
    labels: [
      'Nome completo',
      'CPF',
      'Data de nascimento',
      'Sexo',
      'E-mail',
      'Telefone',
      'Endereço',
      'Contato de emergência (nome)',
      'Contato de emergência (telefone)',
      'Observações de saúde',
    ],
    texts: ['Salvar'],
  },
  {
    path: `/students/${STUDENT_ID}`,
    shell: true,
    headings: [
      'Rafaela Prado Cunha',
      'Identificação',
      'Contato',
      'Emergência',
      'Responsável e consentimentos',
      'Matrículas',
      'Pagamentos',
      'Presenças',
      'Privacidade',
    ],
    columns: [
      'Plano',
      'Início',
      'Vencimento',
      'Valor',
      'Situação',
      'Período',
      'Pagar até',
      'Valor',
      'Situação',
      'Data',
      'Hora',
      'Registrado por',
    ],
    texts: ['Editar', 'Inativar', 'Ativo'],
  },
  {
    path: `/students/${STUDENT_ID}/edit`,
    shell: true,
    headings: ['Editar aluno'],
    labels: [
      'Nome completo',
      'CPF',
      'Data de nascimento',
      'Sexo',
      'E-mail',
      'Telefone',
      'Endereço',
      'Contato de emergência (nome)',
      'Contato de emergência (telefone)',
      'Observações de saúde',
    ],
    texts: ['Salvar', 'Cancelar'],
  },
  {
    path: '/staff',
    shell: true,
    headings: ['Funcionários'],
    columns: ['Nome', 'Cargo', 'Setor', 'Situação'],
    texts: ['Novo funcionário'],
  },
  {
    path: '/staff/new',
    shell: true,
    headings: ['Novo funcionário'],
    labels: ['Nome completo', 'CPF', 'Cargo', 'Setor', 'Data de admissão', 'Telefone', 'E-mail'],
    texts: ['Salvar'],
  },
  {
    path: `/staff/${STAFF_ID}`,
    shell: true,
    headings: ['Rafaela Prado Cunha', 'Acesso ao sistema', 'Privacidade'],
    labels: ['Usuário vinculado'],
    texts: ['Sem usuário vinculado'],
  },
  {
    path: `/staff/${STAFF_ID}/edit`,
    shell: true,
    headings: ['Editar funcionário'],
    labels: ['Nome completo', 'CPF', 'Cargo', 'Setor', 'Data de admissão', 'Telefone', 'E-mail'],
    texts: ['Salvar', 'Cancelar'],
  },
  {
    path: '/plans',
    shell: true,
    headings: ['Planos'],
    columns: ['Nome', 'Periodicidade', 'Valor', 'Regras de acesso', 'Situação'],
    texts: ['Novo plano'],
  },
  {
    path: '/plans/new',
    shell: true,
    headings: ['Novo plano'],
    labels: ['Nome', 'Periodicidade', 'Valor (R$)', 'Regras de acesso'],
    texts: ['Salvar'],
  },
  {
    path: `/plans/${PLAN_ID}/edit`,
    shell: true,
    headings: ['Editar plano'],
    labels: ['Nome', 'Periodicidade', 'Valor (R$)', 'Regras de acesso'],
    texts: ['Salvar', 'Inativar', 'Cancelar'],
  },
  {
    path: '/payments',
    shell: true,
    headings: ['Pagamentos'],
    columns: ['Aluno', 'Plano', 'Período', 'Pagar até', 'Valor', 'Situação'],
    labels: ['Situação'],
    texts: ['Filtrar', 'Limpar', '1 resultado'],
  },
  {
    path: '/check-ins',
    shell: true,
    headings: ['Presenças'],
    columns: ['Data', 'Hora', 'Aluno', 'Registrado por'],
    labels: ['De', 'Até'],
    texts: ['Filtrar', 'Limpar', 'Total no período: 1'],
  },
  {
    path: '/check-in',
    shell: true,
    headings: ['Check-in'],
    labels: ['Nome ou CPF'],
    texts: ['Buscar'],
  },
  {
    path: '/audit',
    shell: true,
    headings: ['Auditoria'],
    labels: ['De', 'Até', 'Usuário', 'Ação', 'IP'],
    texts: ['Filtrar', 'Limpar', '0 resultados', 'Nenhum registro encontrado.'],
  },
  {
    path: '/leads',
    shell: true,
    headings: ['Interessados'],
    labels: ['Situação'],
    texts: ['Filtrar', 'Limpar', '0 resultados', 'Nenhum interessado.'],
  },
  {
    path: '/users',
    shell: true,
    headings: ['Usuários'],
    columns: ['Nome', 'E-mail', 'Perfil', 'Situação', '2FA', 'Ações'],
    texts: ['Novo usuário'],
  },
  {
    path: '/privacy',
    shell: true,
    headings: ['Privacidade'],
    labels: ['Anonimizar alunos inativos há mais de', 'Desligado', 'Guardar versões de foto por'],
    texts: ['Salvar'],
  },
  {
    path: '/account',
    shell: true,
    headings: ['Minha conta', 'Trocar senha', 'Verificação em duas etapas'],
    labels: ['Senha atual', 'Nova senha'],
  },
  {
    path: `/students/${STUDENT_ID}/print`,
    shell: true,
    headings: [
      'Dados do aluno: Rafaela Prado Cunha',
      'Dados pessoais',
      'Responsáveis',
      'Consentimentos',
      'Matrículas',
      'Pagamentos',
      'Presenças',
      'Fotos',
    ],
    columns: [
      'Nome',
      'CPF',
      'Telefone',
      'Parentesco',
      'Cadastrado em',
      'Finalidade',
      'Versão do termo',
      'Texto do termo',
      'Concedido por',
      'Concedido em',
      'Revogado em',
      'Plano',
      'Início',
      'Vencimento',
      'Valor',
      'Cancelada em',
      'Período que começa em',
      'Confirmado em',
      'Desfeito em',
      'Dia',
      'Registrada em',
    ],
    texts: ['Imprimir'],
  },
  {
    path: `/staff/${STAFF_ID}/print`,
    shell: true,
    headings: ['Dados do funcionário: Rafaela Prado Cunha', 'Dados pessoais', 'Usuário', 'Fotos'],
    texts: ['Imprimir'],
  },
];

export const AUTHENTICATED = SCREENS.filter(
  (screen) => screen.path !== '/login' && screen.path !== '/login/two-factor',
);

/** Abre a tela com a sessão que ela espera; devolve a resposta do documento. */
export async function open(page: Page, api: FakeApi, path: string) {
  if (path.startsWith('/login')) api.session = undefined;
  else if (path.startsWith('/minha-conta')) api.session = sessionOf('student', { name: PORTAL_NAME, email: PORTAL_PROFILE.email ?? undefined });
  else api.session = sessionOf('admin');
  return page.goto(path);
}

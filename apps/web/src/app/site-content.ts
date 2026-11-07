/**
 * O texto, as URLs e as imagens da landing da DukFit (refino visual, door 2): a página não lê nada da
 * API, tudo vem daqui. A forma é a da door 2 do plano: a DukFit de Flores, Manaus como um lugar, com
 * o herói, a visita em segundo lugar e as quatro cenas reais, cada uma uma vez.
 */

const ADDRESS = 'DUK%20FIT%20Academia%2C%20Rua%20Uberaba%2C%20Av.%20Duque%20de%20Caxias%2C%20135%2C%20Conjunto%20Flores%2C%20Manaus-AM%2C%2069093-000';

export const SITE = {
  // o tipo de página da skill de desenho (door 2): a landing é um lugar, não um app
  kind: 'place',
  name: 'DukFit',
  legalName: 'DUK FIT Academia',
  // a door 3 fixa o `logo-dukfit-96.webp` no cabeçalho e no rodapé; o `small` serve o `Brand` do app
  logo: { src: '/dukfit/logo-dukfit-96.webp', small: '/dukfit/logo-dukfit-96.webp', alt: 'DUK FIT Academia' },
  instagram: { handle: '@dukfitacademia', url: 'https://www.instagram.com/dukfitacademia/' },
  footer: 'Musculação e acompanhamento em Flores, Manaus.',
  rights: 'Todos os direitos reservados.',
  hours: { days: 'Todos os dias', opens: '06:00', closes: '22:00' },
  address: {
    street: 'Rua Uberaba, Av. Duque de Caxias, 135',
    district: 'Conjunto Flores, Manaus–AM, 69093-000',
  },
  neighborhood: 'Conjunto Flores',
  // as URLs de rota da landing anterior, literais (dukfit-landing, door 5)
  routes: {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ADDRESS}&travelmode=driving&dir_action=navigate`,
    waze: `https://waze.com/ul?q=${ADDRESS}&navigate=yes&utm_source=dukfit`,
    uber: 'https://m.uber.com/looking?pickup=my_location&dropoff%5Bnickname%5D=DUK%20FIT%20Academia&dropoff%5Bformatted_address%5D=Rua%20Uberaba%2C%20Av.%20Duque%20de%20Caxias%2C%20135%2C%20Conjunto%20Flores%2C%20Manaus-AM%2C%2069093-000',
  },
  routeLabels: { google: 'Google Maps', waze: 'Waze', uber: 'Uber' },
  labels: {
    hours: 'Horário',
    neighborhood: 'Bairro',
    address: 'Endereço',
    nav: 'Seções',
    footerNav: 'Rodapé',
    guest: 'Acesso da equipe',
    member: 'Ir para o painel',
  },
  // a navegação tem as quatro palavras da door 2, na ordem das seções
  nav: [
    { href: '#academia', label: 'Academia' },
    { href: '#estrutura', label: 'Estrutura' },
    { href: '#planos', label: 'Planos' },
    { href: '#visita', label: 'Visita' },
  ],
  // a ordem literal das seções: o herói, a visita, a academia, a estrutura, os planos e o fecho
  sections: {
    visit: 'visita',
    about: 'academia',
    structure: 'estrutura',
    plans: 'planos',
    closing: 'fecho',
  },
  hero: {
    src: '/dukfit/salao-cardio-1600.webp',
    alt: 'Área de cardio e musculação da DUK FIT Academia',
    width: 1448,
    height: 1086,
    title: 'Musculação e cardio em Flores, Manaus',
    subline: 'Treine todos os dias, das 06:00 às 22:00, com acompanhamento de perto.',
    cta: { label: 'Quero treinar', href: '/matricula' },
  },
  visit: {
    eyebrow: 'Visita',
    title: 'A academia fica em Flores, Manaus. Passa lá.',
    hoursLabel: 'Todos os dias',
    routesLabel: 'Como chegar',
  },
  about: {
    eyebrow: 'Academia',
    title: 'Uma academia de bairro, old school e de perto.',
    listTitle: 'Por que treinar aqui',
    lead: 'Treino é mais que estética: é confiança, disciplina e uma rotina da qual você se orgulha.',
    text: 'Uma academia familiar e old school no Conjunto Duque de Caxias, com estrutura de musculação e orientação próxima para você manter o treino em movimento.',
    highlight: {
      title: 'Treine com consistência',
      text: 'Equipamentos para musculação e cardio, ambiente próximo e uma equipe preparada para acompanhar sua rotina, seja você iniciante ou veterano.',
    },
    proof: { value: '10+', label: 'Anos fazendo parte da rotina de Flores' },
    photo: {
      src: '/dukfit/musculacao-440.webp',
      alt: 'Área de musculação da DUK FIT com equipamentos amarelos e pretos',
      width: 441,
      height: 440,
    },
  },
  structure: {
    eyebrow: 'Estrutura',
    title: 'Musculação e cardio no mesmo espaço.',
    photos: [
      {
        src: '/dukfit/cardio-440.webp',
        alt: 'Área de esteiras e equipamentos da DUK FIT',
        width: 438,
        height: 435,
      },
      {
        src: '/dukfit/amanhecer-440.webp',
        alt: 'Treino realizado às seis e vinte e nove da manhã na DUK FIT',
        width: 436,
        height: 439,
      },
    ],
    items: [
      { title: 'Musculação', text: 'Equipamentos e espaço para construir força e manter seu plano em movimento.' },
      { title: 'Cardio', text: 'Esteiras e equipamentos para complementar sua rotina de treino.' },
      { title: 'Acompanhamento', text: 'Orientação próxima para você treinar com mais confiança no dia a dia.' },
    ],
  },
  // o bloco dentro da `#academia`: a equipe e a rotina, em linhas com régua
  why: [
    { title: 'Equipe que conhece você', text: 'Orientação de perto, pelo nome, do primeiro treino em diante.' },
    { title: 'Treino para cada nível', text: 'Do iniciante ao veterano, cada um no seu ritmo.' },
    { title: 'Ambiente de bairro', text: 'Familiar, old school e sem frescura.' },
    { title: 'Aberta todos os dias', text: 'Das 06:00 às 22:00, inclusive fim de semana.' },
  ],
  // um plano só, sem valor no site: a mensalidade é definida na matrícula, no sistema (AD-106)
  plans: {
    eyebrow: 'Planos',
    title: 'Um plano só, com tudo o que você precisa para treinar.',
    price: 'Consulte na recepção',
    featuresLabel: 'Inclui',
    items: [
      {
        name: 'Plano mensal',
        text: 'Para treinar no seu ritmo.',
        features: ['Musculação e cardio', 'Acompanhamento da equipe', 'Acesso das 06:00 às 22:00'],
        // o "Matricule-se" leva ao pré-cadastro público (pre-cadastro, AD-117)
        cta: { label: 'Matricule-se', href: '/matricula' },
      },
    ],
  },
  // as páginas públicas do pré-cadastro (pre-cadastro, door 11): `/matricula`, `/confirmar` e `/enviado`
  matricula: {
    eyebrow: 'Pré-cadastro',
    title: 'Pré-cadastro',
    intro: 'Deixe seu contato e a recepção chama você para concluir a matrícula.',
    fields: { name: 'Nome', email: 'E-mail', tel: 'Telefone' },
    adult: 'Tenho 18 anos ou mais',
    consent: 'Li e aceito o termo de tratamento de dados',
    consentRequired: 'Aceite o termo de tratamento de dados para continuar.',
    term: 'Ler o termo',
    submit: 'Enviar',
    google: 'Continuar com Google',
    googleAccount: 'Conta Google',
    googleError: 'Não foi possível entrar com o Google. Preencha o formulário.',
    tooMany: 'Muitas tentativas. Tente de novo em alguns minutos.',
    unavailable: 'O pré-cadastro está indisponível agora. Tente de novo em instantes.',
    sent: 'Enviamos um link para o seu e-mail. Abra-o em até 24 horas para confirmar.',
    confirmed: 'E-mail confirmado. A recepção vai entrar em contato para concluir sua matrícula.',
    confirmTitle: 'Confirme seu e-mail',
    confirm: 'Confirmar e-mail',
    back: 'Voltar ao pré-cadastro',
  },
  // o menu do celular do cabeçalho flutuante (motion, door 7)
  menu: { open: 'Abrir menu', close: 'Fechar menu', title: 'Menu' },
  newsletter: {
    title: 'Fique por dentro',
    text: 'Novidades, horários especiais e o dia a dia da academia no nosso Instagram.',
    cta: 'Seguir',
  },
  closing: {
    title: 'Seu treino começa hoje.',
    text: 'Venha conhecer a academia: a equipe recebe você na recepção, todos os dias, das 06:00 às 22:00.',
  },
} as const;

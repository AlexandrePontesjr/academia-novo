/**
 * O texto e as imagens da landing da DukFit (dukfit-landing, door 3): a página não lê nada da API,
 * tudo vem daqui. Conteúdo trazido da landing do projeto anterior da academia; a disposição segue a
 * referência visual enviada em 2026-10-21.
 */

const ADDRESS = 'DUK%20FIT%20Academia%2C%20Rua%20Uberaba%2C%20Av.%20Duque%20de%20Caxias%2C%20135%2C%20Conjunto%20Flores%2C%20Manaus-AM%2C%2069093-000';

export const SITE = {
  name: 'DukFit',
  legalName: 'DUK FIT Academia',
  cta: { guest: 'Acesso da equipe', member: 'Ir para o painel', join: 'Quero treinar', visit: 'Como chegar' },
  // os links do cabeçalho e do rodapé: as âncoras das seções desta página
  nav: [
    { href: '#academia', label: 'Sobre' },
    { href: '#modalidades', label: 'Modalidades' },
    { href: '#estrutura', label: 'Estrutura' },
    { href: '#planos', label: 'Planos' },
    { href: '#localizacao', label: 'Contato' },
  ],
  sections: {
    about: {
      eyebrow: 'Sobre a Dukfit',
      title: 'Uma academia de bairro para você treinar mais forte, viver melhor e ir mais longe.',
    },
    structure: { eyebrow: 'O que você encontra', title: 'Modalidades' },
    why: { eyebrow: 'Por que a Dukfit', title: 'Transforme o treino em um hábito que te leva adiante.' },
    gallery: { eyebrow: 'Nossa estrutura', title: 'Treino de verdade. Espaço de verdade. Evolução visível.' },
    plans: { eyebrow: 'Planos', title: 'Opções para quem está começando, para quem já treina e para quem não para.' },
    location: { eyebrow: 'Onde estamos', title: 'Perto da sua rotina. Em Flores, Manaus.' },
    hours: { eyebrow: 'Horário', title: 'Todos os dias, das 06:00 às 22:00.' },
  },
  eyebrow: 'Academia em Flores, Manaus',
  tagline: ['Treine', 'Todo Dia'],
  intro: 'Musculação, acompanhamento e um ambiente próximo para você construir consistência no seu tempo.',
  proof: { value: '10+', label: 'Anos fazendo parte da rotina de Flores' },
  scroll: 'Role',
  about: {
    lead: 'Treino é mais que estética: é confiança, disciplina e uma rotina da qual você se orgulha.',
    text: 'Uma academia familiar e old school no Conjunto Duque de Caxias, com estrutura de musculação e orientação próxima para você manter o treino em movimento.',
    highlight: {
      title: 'Treine com consistência',
      text: 'Equipamentos para musculação e cardio, ambiente próximo e uma equipe preparada para acompanhar sua rotina, seja você iniciante ou veterano.',
    },
    badge: 'DUK FIT • ACADEMIA DE BAIRRO • FLORES • MANAUS • ',
    photo: {
      src: '/dukfit/musculacao-440.webp',
      alt: 'Área de musculação da DUK FIT com equipamentos amarelos e pretos',
      width: 441,
      height: 440,
    },
  },
  structure: [
    { title: 'Musculação', text: 'Equipamentos e espaço para construir força e manter seu plano em movimento.' },
    { title: 'Acompanhamento', text: 'Orientação próxima para você treinar com mais confiança no dia a dia.' },
    { title: 'Cardio', text: 'Esteiras e equipamentos para complementar sua rotina de treino.' },
  ],
  why: {
    photo: {
      src: '/dukfit/amanhecer-440.webp',
      alt: 'Treino realizado às seis e vinte e nove da manhã na DUK FIT',
      width: 436,
      height: 439,
    },
    items: [
      { icon: 'check', title: 'Equipe que conhece você', text: 'Orientação de perto, pelo nome, do primeiro treino em diante.' },
      { icon: 'layers', title: 'Treino para cada nível', text: 'Do iniciante ao veterano, cada um no seu ritmo.' },
      { icon: 'dumbbell', title: 'Musculação e cardio', text: 'Aparelhos e esteiras para um treino completo.' },
      { icon: 'heart', title: 'Ambiente de bairro', text: 'Familiar, old school e sem frescura.' },
      { icon: 'clock', title: 'Aberta todos os dias', text: 'Das 06:00 às 22:00, inclusive fim de semana.' },
      { icon: 'bolt', title: 'Evolução de verdade', text: 'Consistência no dia a dia vira resultado.' },
    ],
  },
  gallery: [
    {
      src: '/dukfit/salao-cardio-800.webp',
      alt: 'Visão ampla da DUK FIT com esteiras, bicicletas e aparelhos de musculação',
      caption: 'Cardio e musculação',
      width: 800,
      height: 600,
    },
    {
      src: '/dukfit/musculacao-440.webp',
      alt: 'Aluna treinando na área de musculação da DUK FIT',
      caption: 'Treino em movimento',
      width: 441,
      height: 440,
    },
    {
      src: '/dukfit/cardio-440.webp',
      alt: 'Área de esteiras e equipamentos da DUK FIT',
      caption: 'Estrutura completa',
      width: 438,
      height: 435,
    },
    {
      src: '/dukfit/amanhecer-440.webp',
      alt: 'Treino realizado às seis e vinte e nove da manhã na DUK FIT',
      caption: 'Desde cedo com você',
      width: 436,
      height: 439,
    },
  ],
  galleryLabels: { previous: 'Foto anterior', next: 'Próxima foto' },
  // um plano só, sem valor no site: a mensalidade é definida na matrícula, no sistema (AD-106)
  plans: {
    price: 'Consulte na recepção',
    featuresLabel: 'Inclui',
    items: [
      {
        name: 'Plano mensal',
        text: 'Para treinar no seu ritmo.',
        features: ['Musculação e cardio', 'Acompanhamento da equipe', 'Acesso das 06:00 às 22:00'],
        cta: 'Matricule-se',
      },
    ],
  },
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
  labels: { hours: 'Horário', neighborhood: 'Bairro', address: 'Endereço', nav: 'Seções', footerNav: 'Rodapé' },
  // o menu do celular do cabeçalho flutuante (motion, door 7)
  menu: { open: 'Abrir menu', close: 'Fechar menu', title: 'Menu' },
  closing: {
    title: 'Seu treino começa hoje.',
    text: 'Venha conhecer a academia: a equipe recebe você na recepção, todos os dias, das 06:00 às 22:00.',
  },
  instagram: { handle: '@dukfitacademia', url: 'https://www.instagram.com/dukfitacademia/' },
  newsletter: {
    title: 'Fique por dentro',
    text: 'Novidades, horários especiais e o dia a dia da academia no nosso Instagram.',
    cta: 'Seguir',
  },
  footer: 'Musculação e acompanhamento em Flores, Manaus.',
  rights: 'Todos os direitos reservados.',
  logo: { src: '/dukfit/logo-dukfit-512.webp', small: '/dukfit/logo-dukfit-96.webp', alt: 'DUK FIT Academia' },
  hero: {
    src: '/dukfit/salao-cardio-1600.webp',
    alt: 'Área de cardio e musculação da DUK FIT Academia',
    width: 1448,
    height: 1086,
  },
} as const;

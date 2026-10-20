/**
 * O texto e as imagens da landing da DukFit (dukfit-landing, door 3): a página não lê nada da API,
 * tudo vem daqui. Conteúdo trazido da landing do projeto anterior da academia.
 */

const ADDRESS = 'DUK FIT Academia, Rua Uberaba, Av. Duque de Caxias, 135, Conjunto Flores, Manaus-AM, 69093-000';
const DESTINATION = encodeURIComponent(ADDRESS);

export const SITE = {
  name: 'DukFit',
  legalName: 'DUK FIT Academia',
  eyebrow: 'Academia em Flores, Manaus',
  tagline: ['Seu corpo.', 'Seu ritmo.', 'Sua evolução.'],
  intro: 'Musculação, acompanhamento e um ambiente próximo para você construir consistência no seu tempo.',
  proof: { value: '10+', label: 'Anos fazendo parte da rotina de Flores' },
  about: {
    title: 'Treino de verdade. Presença todos os dias.',
    text: 'Uma academia familiar e old school no Conjunto Duque de Caxias, com estrutura de musculação e orientação próxima para você manter o treino em movimento.',
    highlight: {
      title: 'Treine com consistência',
      text: 'Equipamentos para musculação e cardio, ambiente próximo e uma equipe preparada para acompanhar sua rotina.',
    },
    photos: [
      {
        src: '/dukfit/musculacao-440.webp',
        alt: 'Área de musculação da DUK FIT com equipamentos amarelos e pretos',
        width: 441,
        height: 440,
      },
      {
        src: '/dukfit/cardio-440.webp',
        alt: 'Esteiras e equipamentos de cardio da DUK FIT Academia',
        width: 438,
        height: 435,
      },
    ],
  },
  structure: [
    { title: 'Musculação', text: 'Equipamentos e espaço para construir força e manter seu plano em movimento.' },
    { title: 'Acompanhamento', text: 'Orientação próxima para você treinar com mais confiança no dia a dia.' },
    { title: 'Cardio', text: 'Esteiras e equipamentos para complementar sua rotina de treino.' },
  ],
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
  hours: { days: 'Todos os dias', opens: '06:00', closes: '22:00' },
  address: {
    street: 'Rua Uberaba, Av. Duque de Caxias, 135',
    district: 'Conjunto Flores, Manaus–AM, 69093-000',
  },
  neighborhood: 'Conjunto Flores',
  routes: {
    google: `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}&travelmode=driving`,
    waze: `https://waze.com/ul?q=${DESTINATION}&navigate=yes`,
    uber: `https://m.uber.com/looking?pickup=my_location&dropoff%5Bnickname%5D=${encodeURIComponent('DUK FIT Academia')}&dropoff%5Bformatted_address%5D=${DESTINATION}`,
  },
  instagram: { handle: '@dukfitacademia', url: 'https://www.instagram.com/dukfitacademia/' },
  footer: 'Musculação e acompanhamento em Flores, Manaus.',
  logo: { src: '/dukfit/logo-dukfit-512.webp', small: '/dukfit/logo-dukfit-96.webp', alt: 'DUK FIT Academia' },
  hero: {
    src: '/dukfit/salao-cardio-1600.webp',
    alt: 'Área de cardio e musculação da DUK FIT Academia',
    width: 1448,
    height: 1086,
  },
} as const;

/**
 * O texto da landing da DukFit (dukfit-app, door 4): a página não lê nada da API, tudo vem daqui.
 *
 * EXEMPLO - endereço, telefone, WhatsApp, horários, modalidades e slogan abaixo são provisórios e
 * não podem ir ao ar assim (Open question 1 do plano, `blocks go-live`): troque pelos da academia.
 */
export const SITE = {
  name: 'DukFit',
  tagline: 'Sua academia de bairro. Mais forte a cada treino.',
  intro: 'Musculação, aulas e acompanhamento de perto, a poucos passos de casa.',
  address: 'Rua Exemplo, 123 - Centro',
  phone: '(11) 0000-0000',
  whatsapp: '5511900000000',
  hours: [
    { days: 'Segunda a sexta', opens: '06:00', closes: '22:00' },
    { days: 'Sábado', opens: '08:00', closes: '14:00' },
    { days: 'Domingo e feriados', opens: '09:00', closes: '13:00' },
  ],
  highlights: [
    { title: 'Treino com acompanhamento', text: 'Instrutores no salão o dia inteiro para ajustar carga, postura e ritmo.' },
    { title: 'Tudo em um lugar', text: 'Matrícula, pagamentos e presença registrados na hora, sem papelada.' },
    { title: 'Feita para a constância', text: 'Horários amplos e ambiente de bairro para você não perder o ritmo.' },
  ],
  modalities: ['Musculação', 'Funcional', 'Cardio', 'Alongamento'],
} as const;

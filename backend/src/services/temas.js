// Paleta padrão da plataforma — usada quando uma empresa é criada (ainda não
// escolheu as próprias cores) e como fallback se por algum motivo faltar
// linha em empresa_temas (não deveria acontecer hoje, já que POST /empresas
// sempre cria os 2 modos na hora, mas cobre dado legado/incompleto).
export const TEMA_PADRAO_CLARO = {
  border_radius: 'lg',
  primary_color: '#546B41',
  primary_foreground: '#FFF8EC',
  primary_hover: '#435634',
  page_background: '#FFF8EC',
  card_background: '#FFF8EC',
  card_border: '#DCCCAC',
  heading_color: '#546B41',
  subheading_color: '#99AD7A',
  body_text_color: '#3D4F31',
  badge_background: '#dc2626',
  badge_text: '#ffffff',
};

export const TEMA_PADRAO_ESCURO = {
  border_radius: 'lg',
  primary_color: '#99AD7A',
  primary_foreground: '#2E3B23',
  primary_hover: '#88A066',
  page_background: '#1C2415',
  card_background: '#262F1B',
  card_border: '#3A4A2D',
  heading_color: '#FFF8EC',
  subheading_color: '#99AD7A',
  body_text_color: '#DCCCAC',
  badge_background: '#dc2626',
  badge_text: '#ffffff',
};

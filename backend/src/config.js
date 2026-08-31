import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const config = {
  port: process.env.PORT || 3333,
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  superAdminEmails: (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  magazord: {
    baseUrl: process.env.MAGAZORD_BASE_URL || '',
    user: process.env.MAGAZORD_USER || '',
    password: process.env.MAGAZORD_PASSWORD || '',
    tabelaPrecoId: process.env.MAGAZORD_TABELA_PRECO_ID || '1',
    lojaId: process.env.MAGAZORD_LOJA_ID || '1',
    storefrontBaseUrl: process.env.MAGAZORD_STOREFRONT_URL || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  streaming: {
    signingSecret: process.env.STREAM_SIGNING_SECRET || '',
    authServiceUrl: process.env.STREAM_AUTH_SERVICE_URL || '',
    serverPublicUrl: process.env.STREAM_SERVER_PUBLIC_URL || '',
    rtmpPublicUrl: process.env.STREAM_SERVER_RTMP_URL || '',
    // Credencial do DASHBOARD_USER/DASHBOARD_PASS do serviço de auth — o
    // /api/summary (usado por audienciaWebrtc) fica atrás de basic auth lá.
    dashboardUser: process.env.STREAM_DASHBOARD_USER || '',
    dashboardPass: process.env.STREAM_DASHBOARD_PASS || '',
  },
};

export { required };

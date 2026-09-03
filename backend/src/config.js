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
    // Só protocolo+host (ex: rtmp://live.suaempresa.com.br), SEM porta/path —
    // a porta é calculada por live (ver streamAuth.js: portaRtmpDaLive), já
    // que cada instância do servidor de live (sharding) usa uma porta RTMP
    // diferente. Antes disso existir, essa variável guardava a URL completa
    // (com porta e /live já embutidos) — nome mudou de propósito
    // (STREAM_SERVER_RTMP_URL -> STREAM_SERVER_RTMP_HOST) pra forçar
    // reconfigurar em vez de guardar o valor errado silenciosamente.
    rtmpHost: process.env.STREAM_SERVER_RTMP_HOST || '',
    // Precisam bater com o docker-compose.yml do test-live-server: quantas
    // instâncias de SRS existem (SRS_INSTANCIAS lá) e a primeira porta RTMP
    // (RTMP_PORT da instância 0). As portas seguintes são sequenciais
    // (rtmpPortaBase, +1, +2...), uma por instância.
    shardCount: Number(process.env.STREAM_SHARD_COUNT || 4),
    rtmpPortaBase: Number(process.env.STREAM_RTMP_PORTA_BASE || 1935),
    // Credencial do DASHBOARD_USER/DASHBOARD_PASS do serviço de auth — o
    // /api/summary (usado por audienciaWebrtc) fica atrás de basic auth lá.
    dashboardUser: process.env.STREAM_DASHBOARD_USER || '',
    dashboardPass: process.env.STREAM_DASHBOARD_PASS || '',
  },
  // Segredo comparado de forma timing-safe em POST /metricas/capturar, pra
  // permitir o pg_cron (sem usuário nenhum) disparar a captura periódica.
  metricsCronSecret: process.env.METRICS_CRON_SECRET || '',
};

export { required };

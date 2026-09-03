export const config = {
  encryptionKey: Deno.env.get('ENCRYPTION_KEY') ?? '',
  superAdminEmails: (Deno.env.get('SUPER_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  magazord: {
    baseUrl: Deno.env.get('MAGAZORD_BASE_URL') ?? '',
    user: Deno.env.get('MAGAZORD_USER') ?? '',
    password: Deno.env.get('MAGAZORD_PASSWORD') ?? '',
    tabelaPrecoId: Deno.env.get('MAGAZORD_TABELA_PRECO_ID') ?? '1',
    lojaId: Deno.env.get('MAGAZORD_LOJA_ID') ?? '1',
    storefrontBaseUrl: Deno.env.get('MAGAZORD_STOREFRONT_URL') ?? '',
  },
  supabase: {
    // No Supabase, a Edge Function já recebe essas duas prontas — não precisa configurar.
    url: Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  },
  streaming: {
    signingSecret: Deno.env.get('STREAM_SIGNING_SECRET') ?? '',
    authServiceUrl: Deno.env.get('STREAM_AUTH_SERVICE_URL') ?? '',
    serverPublicUrl: Deno.env.get('STREAM_SERVER_PUBLIC_URL') ?? '',
    // Só protocolo+host, SEM porta/path — porta é calculada por live (ver
    // streamAuth.ts: portaRtmpDaLive), já que cada instância do servidor de
    // live (sharding) usa uma porta RTMP diferente. Nome mudou de propósito
    // (STREAM_SERVER_RTMP_URL -> STREAM_SERVER_RTMP_HOST) pra forçar
    // reconfigurar em vez de guardar o valor antigo (URL completa) errado.
    rtmpHost: Deno.env.get('STREAM_SERVER_RTMP_HOST') ?? '',
    // Precisam bater com o docker-compose.yml do test-live-server: quantas
    // instâncias de SRS existem (SRS_INSTANCIAS lá) e a primeira porta RTMP.
    shardCount: Number(Deno.env.get('STREAM_SHARD_COUNT') ?? '4'),
    rtmpPortaBase: Number(Deno.env.get('STREAM_RTMP_PORTA_BASE') ?? '1935'),
    // Credencial do DASHBOARD_USER/DASHBOARD_PASS do serviço de auth — o
    // /api/summary (usado por audienciaWebrtc) fica atrás de basic auth lá.
    dashboardUser: Deno.env.get('STREAM_DASHBOARD_USER') ?? '',
    dashboardPass: Deno.env.get('STREAM_DASHBOARD_PASS') ?? '',
  },
  // Segredo comparado de forma timing-safe em POST /metricas/capturar, pra
  // permitir o pg_cron (sem usuário nenhum) disparar a captura periódica.
  metricsCronSecret: Deno.env.get('METRICS_CRON_SECRET') ?? '',
};

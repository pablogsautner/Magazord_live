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
};

import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const config = {
  port: process.env.PORT || 3333,
  adminApiKey: process.env.ADMIN_API_KEY || '',
  magazord: {
    baseUrl: process.env.MAGAZORD_BASE_URL || '',
    user: process.env.MAGAZORD_USER || '',
    password: process.env.MAGAZORD_PASSWORD || '',
    tabelaPrecoId: process.env.MAGAZORD_TABELA_PRECO_ID || '1',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
};

export { required };

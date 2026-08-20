# Magazord Live Shopping — MVP

## Estrutura
- `backend/` — Node/Express, único ponto que fala com a API da Magazord (credenciais ficam só aqui).
- `frontend/` — Vue 3 + Vite. Rota `/admin/*` é o painel de controle; rota `/player/:liveId` é a que vai no `<iframe>` do site da Magazord.
- `supabase/schema.sql` — tabelas `lives` e `live_products` + políticas de RLS + Realtime.

## Setup

1. Criar um projeto no [Supabase](https://supabase.com) (free tier) e rodar `supabase/schema.sql` no SQL Editor.
2. Criar um usuário admin em Authentication → Users (email/senha) — é o login do painel.
3. Backend:
   ```
   cd backend
   cp .env.example .env   # preencher com as credenciais da Magazord e do Supabase (service_role key)
   npm install
   npm run dev
   ```
4. Frontend:
   ```
   cd frontend
   cp .env.example .env   # preencher com a URL/anon key do Supabase e a URL do backend
   npm install
   npm run dev
   ```
5. Login em `/admin/login`, criar uma live (ID do vídeo do YouTube), adicionar produtos pelo código da Magazord.
6. Embedar `https://SEU_DOMINIO/player/{liveId}` num `<iframe>` na página da Magazord.

## Testado
O proxy do backend (`GET /produtos/:codigo`) foi validado direto contra a API real da Magazord — junta detalhe (nome/imagem), preço e estoque num único JSON.

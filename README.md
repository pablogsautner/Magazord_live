# Magazord Live Shopping — MVP

## Estrutura
- `backend/` — Node/Express. Único ponto que fala com a API da Magazord e o único que tem a `service_role` key do Supabase. Toda escrita do sistema passa por aqui.
- `frontend/` — Vue 3 + Vite. Rota `/admin/*` é o painel de controle; rota `/player/:liveId` é a que vai no `<iframe>` do site do cliente.
- `supabase/` — os `.sql` pra rodar no SQL Editor do Supabase, **em ordem**:
  1. `schema.sql` — tabelas `lives` e `live_products`.
  2. `002_empresas_membros.sql` — tabelas `empresas` (uma por cliente do SaaS) e `membros` (liga usuário ↔ empresa).
  3. `003_empresa_id_lives.sql` — liga `lives` a `empresas` e fecha a escrita direta no Supabase (só o backend escreve).
  4. `004_cupons.sql` — tabela `cupons` (vinculada a uma live).
  5. `005_configuracoes.sql` — configurações globais da plataforma (chave/valor).
  6. `006_empresa_configuracoes.sql` — configurações por empresa (nome da loja, tema, cores).

## Como a autenticação funciona (importante ler antes de mexer)

Não existe mais chave fixa (`ADMIN_API_KEY`) protegendo o backend. Toda rota agora exige o **token de sessão real do Supabase Auth**, do jeito que o login em `/admin/login` já gera:

```
Authorization: Bearer <access_token>
```

O front já faz isso sozinho (veja `frontend/src/lib/backend.js` — pega o token da sessão atual e anexa em toda chamada). Se você for chamar a API na mão (curl, Postman, outro front), pegue o token assim:

```bash
curl -X POST 'https://SEU_PROJETO.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: SUA_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","password":"suasenha"}'
# pega o campo "access_token" da resposta
```

Duas categorias de rota, dois níveis de permissão:

- **Rotas da empresa** (`/produtos`, `/sync`, `/lives`, `/live-products`) — qualquer usuário logado pode chamar, mas o backend confere se ele **pertence à empresa dona do recurso** (tabela `membros`) antes de deixar editar/excluir. Tentar mexer numa live de outra empresa dá `403`.
- **Rotas internas** (`/empresas`, `/usuarios`, `/membros`) — só quem está na lista `SUPER_ADMIN_EMAILS` do `.env` do backend. Tem tela em `/super-admin/empresas` (link "Painel interno" na lista de lives) — cadastra empresa, edita, vincula/cria usuários. Quem não é super admin vê uma mensagem de acesso negado (a segurança de verdade é sempre no backend, a tela só reflete).

## Setup

1. Criar um projeto no [Supabase](https://supabase.com) (free tier) e rodar os 3 arquivos de `supabase/` no SQL Editor, na ordem listada acima.
2. Criar seu primeiro usuário em Authentication → Users (email/senha) — é o login do painel.
3. Backend:
   ```
   cd backend
   cp .env.example .env
   npm install
   npm run dev
   ```
   Preencher no `.env`:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — do seu projeto Supabase.
   - `MAGAZORD_*` — credenciais da Magazord (usadas hoje pra toda empresa; virar per-empresa é o próximo passo).
   - `ENCRYPTION_KEY` — gere com `openssl rand -hex 32` (ou `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Usada só pra criptografar a senha da Magazord de cada empresa cadastrada em `/empresas`. **Trocar depois de já ter empresa cadastrada invalida os dados salvos.**
   - `SUPER_ADMIN_EMAILS` — seu email (o que você criou no passo 2), separado por vírgula se for mais de um.
4. Frontend:
   ```
   cd frontend
   cp .env.example .env   # preencher URL/anon key do Supabase e a URL do backend
   npm install
   npm run dev
   ```
5. Criar sua empresa e se vincular a ela (via curl, com o token do passo 2 — veja exemplo abaixo).
6. Login em `/admin/login`, criar uma live, adicionar produtos.
7. Embedar `https://SEU_DOMINIO/player/{liveId}` num `<iframe>` na página do cliente.

### Exemplo: cadastrar sua empresa e se vincular

```bash
TOKEN="<access_token de um email que está em SUPER_ADMIN_EMAILS>"

# 1. cria a empresa
curl -X POST http://localhost:3333/empresas -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "nome": "Nome da empresa",
  "magazord_base_url": "https://cliente.painel.magazord.com.br/api",
  "magazord_user": "usuario-da-api",
  "magazord_password": "senha-da-api",
  "magazord_storefront_url": "https://lojadocliente.com.br"
}'
# guarda o "id" que voltou

# 2. vincula seu usuário a ela (pega seu user_id em GET /usuarios)
curl -X POST http://localhost:3333/membros -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"user_id":"<seu-user-id>","empresa_id":"<id-da-empresa>","papel":"owner"}'
```

Depois disso, criar uma live pelo painel (`POST /lives`) resolve a empresa sozinho — só funciona se o usuário pertencer a exatamente uma empresa (senão dá erro claro pedindo pra falar com o super admin).

### Configurar a audiência ao vivo (YouTube)

1. Cria um projeto em [console.cloud.google.com](https://console.cloud.google.com), ativa a **YouTube Data API v3** (Biblioteca de APIs).
2. Cria uma credencial do tipo **Chave de API** (não precisa OAuth) e, por segurança, restringe ela pra só poder chamar a YouTube Data API v3.
3. Salva no sistema (não vai num `.env` — fica na tabela `configuracoes`):
   ```bash
   curl -X PUT http://localhost:3333/configuracoes/youtube_api_key \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"valor": "SUA_CHAVE_AQUI", "criptografado": true}'
   ```

## API do backend

Todas as rotas abaixo (exceto onde marcado) exigem `Authorization: Bearer <token>`. Sem token válido: `401`. Sem vínculo com a empresa do recurso: `403`.

### Produtos (proxy da Magazord)
- **`GET /produtos/buscar?nome=<texto>`** — autocomplete por nome (mín. 3 caracteres), até 15 resultados: `[{ codigo, nome }]`.
- **`GET /produtos/:codigo`** — detalhe + preço + estoque + link da loja num JSON só: `{ produto_codigo, nome, imagem_url, preco, preco_antigo, estoque, url_produto }`.

### Sincronização
- **`POST /sync/live/:liveId`** — revalida preço/estoque dos produtos ativos da live direto na Magazord. Resposta: `{ sincronizados, falhas }`.

### Lives
- **`POST /lives`** — cria uma live. Body: `{ titulo, youtube_video_id }`. A empresa é resolvida automaticamente pelo vínculo do usuário.
- **`PATCH /lives/:id`** — edita `titulo` e/ou `youtube_video_id` (manda só o que for mudar).
- **`DELETE /lives/:id`** — apaga a live e (por `ON DELETE CASCADE`) todos os produtos dela.

### Produtos de uma live
- **`POST /live-products`** — adiciona um produto à live. Body: o retorno de `GET /produtos/:codigo` + `live_id`.
- **`DELETE /live-products/:id`** — remove um produto da live.
- **`POST /live-products/:id/mover`** — troca a posição (`ordem`) com o vizinho. Body: `{ "direcao": 1 }` (desce) ou `{ "direcao": -1 }` (sobe).

### Cupons de desconto
Cria o cupom de verdade na Magazord (funciona no checkout real da loja) e guarda a referência aqui (a Magazord não sabe o que é uma "live"). Leitura é direta no Supabase (RLS pública), igual `lives`/`live_products` — essas rotas são só pra escrita.
- **`POST /cupons`** — cria o cupom. Body: `{ live_id, codigo, descricao, tipo_desconto, valor_desconto, valido_de, valido_ate, valor_minimo_pedido }`, onde `tipo_desconto` é `"percentual"` ou `"fixo"` e as datas são ISO (`validoDe`/`validoAte` na Magazord).
- **`PATCH /cupons/:id`** — atualiza `ativo`/`descricao`/`valido_ate` (nos dois lados: no nosso banco e na Magazord).
- **`DELETE /cupons/:id`** — a Magazord não tem endpoint de excluir cupom, então isso desativa (`ativo: false`) nos dois lados, igual já fazemos com produto/live.

**Testado criando um cupom real** (com validade já expirada de propósito, pra não ficar utilizável): confirmado que `POST /cupons` cria de verdade na Magazord e devolve o `magazord_cupom_id`. No caminho, achamos que a Magazord exige um campo `tipoLimite` na criação que a doc não menciona — fixamos como `1` (uso geral, não amarrado a uma pessoa/CPF, igual os cupons de campanha tipo "FEIRAO10" que já existem na conta).

**Limitação conhecida**: `PATCH /cupons/:id` (usado por `PATCH` e `DELETE` pra ativar/desativar) está retornando `500 Internal Server Error` **do lado da Magazord** pro cupom de teste que criamos — tentamos com campos parciais, completos, tipos string e number, sempre o mesmo erro. Não parece ser problema do nosso payload. Ainda não confirmamos se é específico desse cupom ou de todos — vale investigar com o suporte da Magazord antes de depender dessa rota em produção. O "limite de N usos" continua sem confirmação — não veio nenhum campo de contagem na resposta do cupom criado, só o `tipoLimite` (que parece ser sobre *quem* pode usar, não quantas vezes).

### Audiência ao vivo (YouTube)
- **`GET /lives/:id/audiencia`** — quantas pessoas estão assistindo agora. Resposta: `{ ao_vivo: boolean, espectadores: number | null }` (`espectadores` só vem preenchido quando `ao_vivo` é `true` e o YouTube já informou o número). Usa a `youtube_api_key` cadastrada em `/configuracoes` — sem OAuth, sem login do Google, só leitura pública.

### Configurações da empresa (nome da loja, tema, cores)
Diferente de `/configuracoes` (que é global da plataforma) — isso é por empresa. Leitura é direta no Supabase (`empresa_configuracoes`, RLS pública, pra o player poder aplicar a marca também); essa rota é só pra escrita. Uma linha é criada automaticamente com valores padrão quando a empresa é criada.
- **`PATCH /empresa-configuracoes/:empresaId`** — atualiza qualquer um de: `nome_loja`, `email_contato`, `fuso_horario`, `idioma`, `cor_primaria`, `cor_destaque`, `raio_borda` (`none`/`sm`/`md`/`lg`/`xl`), `logo_url`, `modo_tema` (`claro`/`escuro`/`sistema`).

### Painel interno (só `SUPER_ADMIN_EMAILS`)
- **`GET /empresas`**, **`POST /empresas`**, **`PATCH /empresas/:id`**, **`DELETE /empresas/:id`** — `magazord_password` nunca volta nas respostas (write-only, fica criptografado no banco).
- **`GET /usuarios`**, **`POST /usuarios`** (`{ email, password }`), **`DELETE /usuarios/:id`** — gerencia usuários do Supabase Auth.
- **`GET /membros?empresa_id=<id>`**, **`POST /membros`** (`{ user_id, empresa_id, papel }`), **`DELETE /membros/:id`** — liga/desliga usuário de empresa.
- **`GET /configuracoes`**, **`PUT /configuracoes/:chave`** (`{ valor, criptografado }`) — configurações globais da plataforma (ex: `youtube_api_key`). Valores criptografados nunca voltam na resposta.

## Segurança — o que já está feito

- Autenticação real por usuário (token do Supabase Auth) em vez de chave fixa compartilhada — nada de segredo embutido no bundle do front.
- Toda escrita em `lives`/`live_products` passa pelo backend, que confere o vínculo empresa↔usuário antes de usar a `service_role` key. A escrita direta do front pro Supabase foi desligada no banco (RLS).
- Isolamento entre empresas: usuário de uma empresa não consegue ler/editar/excluir nada de outra (testado com um usuário "intruso" tentando mexer em dado de outra empresa — `403`).
- Senha da Magazord de cada empresa fica criptografada no banco (AES-256-GCM), não em texto puro.
- Rate limiting: 300 req/15min nas rotas gerais, 100 req/15min nas rotas internas.

O que ainda **não** está feito (próximo passo natural): cada empresa usar a própria credencial da Magazord de verdade nas chamadas (`/produtos`, `/sync` ainda usam a credencial única do `.env`, não a de cada empresa cadastrada em `/empresas`); rotação de `ENCRYPTION_KEY`.

## Testado
- Fluxo completo com token real: criar empresa → criar usuário → vincular → criar live → adicionar produto → sincronizar → editar → excluir. Tudo com dados reais contra a API da Magazord.
- Isolamento entre empresas confirmado com um usuário sem vínculo tentando editar live de outra empresa (`403`) e tentando acessar rotas internas sem ser super admin (`403`).
- Escrita direta no Supabase com token de sessão válido confirmada bloqueada (RLS `403`).
- Senha da Magazord confirmada criptografada no banco (não é mais texto puro).
- Painel Vue testado no navegador ponta a ponta com o novo fluxo de auth, sem erros no console.

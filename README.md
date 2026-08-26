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
  7. `007_tema_empresa.sql` — expande as cores do tema pra um conjunto mais completo (botão, superfícies, tipografia, badges).
  8. `008_empresa_temas.sql` — separa as cores em 2 conjuntos por empresa (modo claro e modo escuro), numa tabela `empresa_temas` própria.
  9. `009_comentarios.sql` — chat da live: tabela `comentarios`, leitura pública + Realtime habilitado.

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
- **`GET /produtos/buscar?nome=<texto>`** — autocomplete por nome (mín. 3 caracteres), até 15 resultados: `[{ codigo, nome }]`. Um resultado por produto **pai** (não por variação/cor) — a Magazord retorna cada cor como uma "derivação" separada, então sem essa deduplicação uma única toalha com 20 cores lotaria a lista inteira e esconderia os outros produtos. O `codigo` devolvido é o de uma derivação ativa qualquer (usado só pra puxar preço/estoque/link em `GET /produtos/:codigo`).
- **`GET /produtos/:codigo`** — detalhe + preço + estoque + link da loja num JSON só: `{ produto_codigo, nome, imagem_url, preco, preco_antigo, estoque, url_produto }`. **`estoque` é unificado**: soma o saldo de todas as derivações (cores) ativas do mesmo produto pai, não só da cor recebida em `:codigo` — na Magazord cada cor tem estoque próprio e independente (ex: Branco com 465, Azul com 535), então sem essa soma o número mostrado refletiria só 1 cor entre várias.

### Sincronização
- **`POST /sync/live/:liveId`** — revalida preço/estoque dos produtos ativos da live direto na Magazord. Resposta: `{ sincronizados, falhas }`.

### Lives
- **`POST /lives`** — cria uma live. Body: `{ titulo, youtube_video_id }`. A empresa é resolvida automaticamente pelo vínculo do usuário. `status` começa em `agendada` por padrão (coluna `status` em `lives`, default no banco).
- **`PATCH /lives/:id`** — edita `titulo`, `youtube_video_id` e/ou `status` (manda só o que for mudar). `status` deve ser um de `agendada`/`ao_vivo`/`encerrada` — é o campo que os widgets públicos (tarja, player fullscreen) ficam sondando pra decidir se mostram ou escondem a live.
- **`DELETE /lives/:id`** — apaga a live e (por `ON DELETE CASCADE`) todos os produtos dela.

### Produtos de uma live
- **`POST /live-products`** — adiciona um produto à live. Body: o retorno de `GET /produtos/:codigo` + `live_id`.
- **`PATCH /live-products/:id`** — atualiza `ativo` e/ou `destaque` (booleanos). Existe porque a escrita direta do front no Supabase foi desligada (RLS) — os toggles de "Ativo"/"Destaque" da UI precisam passar por aqui. Ao marcar `destaque: true`, desmarca automaticamente o destaque de qualquer outro produto da mesma live (só pode ter 1 por vez — o player só tem 1 slot de spotlight e esconde da lista normal qualquer produto com `destaque: true`, então 2 marcados faz o segundo sumir da tela).
- **`DELETE /live-products/:id`** — remove um produto da live.
- **`POST /live-products/:id/mover`** — troca a posição (`ordem`) com o vizinho. Body: `{ "direcao": 1 }` (desce) ou `{ "direcao": -1 }` (sobe).

### Cupons de desconto
Cria o cupom de verdade na Magazord (funciona no checkout real da loja) e guarda a referência aqui (a Magazord não sabe o que é uma "live"). Leitura é direta no Supabase (RLS pública), igual `lives`/`live_products` — essas rotas são só pra escrita.
- **`POST /cupons`** — cria o cupom. Body: `{ live_id, codigo, descricao, tipo_desconto, valor_desconto, valido_de, valido_ate, valor_minimo_pedido }`, onde `tipo_desconto` é `"percentual"` ou `"fixo"` e as datas são ISO (`validoDe`/`validoAte` na Magazord).
- **`PATCH /cupons/:id`** — atualiza `ativo`/`descricao`/`valido_ate` (nos dois lados: no nosso banco e na Magazord).
- **`DELETE /cupons/:id`** — a Magazord não tem endpoint de excluir cupom, então isso desativa (`ativo: false`) nos dois lados, igual já fazemos com produto/live.

**Testado criando um cupom real** (com validade já expirada de propósito, pra não ficar utilizável): confirmado que `POST /cupons` cria de verdade na Magazord e devolve o `magazord_cupom_id`. No caminho, achamos que a Magazord exige um campo `tipoLimite` na criação que a doc não menciona — fixamos como `1` (uso geral, não amarrado a uma pessoa/CPF, igual os cupons de campanha tipo "FEIRAO10" que já existem na conta).

**Limitação conhecida**: `PATCH /cupons/:id` (usado por `PATCH` e `DELETE` pra ativar/desativar) está retornando `500 Internal Server Error` **do lado da Magazord** pro cupom de teste que criamos — tentamos com campos parciais, completos, tipos string e number, sempre o mesmo erro. Não parece ser problema do nosso payload. Ainda não confirmamos se é específico desse cupom ou de todos — vale investigar com o suporte da Magazord antes de depender dessa rota em produção. O "limite de N usos" continua sem confirmação — não veio nenhum campo de contagem na resposta do cupom criado, só o `tipoLimite` (que parece ser sobre *quem* pode usar, não quantas vezes).

### Chat da live (comentários)
Diferente de todo o resto da API — essa é a **primeira rota pública sem autenticação** do sistema, porque quem comenta é o espectador anônimo assistindo pelo player, não um usuário logado da plataforma. Por isso a escrita não é liberada direto no Supabase (evitaria virar porta aberta pra spam/flood): passa por uma rota pública do backend, com validação de tamanho e sob o rate limiting geral.
- **`POST /comentarios`** — **sem token**. Body: `{ live_id, nome, texto }` (`nome`: 1–60 caracteres; `texto`: 1–500 caracteres). `404` se a live não existir.
- Leitura é direta no Supabase (`comentarios`, RLS pública) — o player deve usar **Realtime** (`postgres_changes` filtrando por `live_id`) pra mostrar o chat entrando na hora, sem precisar de polling.

### Audiência ao vivo (YouTube)
- **`GET /lives/:id/audiencia`** — quantas pessoas estão assistindo agora. Resposta: `{ ao_vivo: boolean, espectadores: number | null }` (`espectadores` só vem preenchido quando `ao_vivo` é `true` e o YouTube já informou o número). Usa a `youtube_api_key` cadastrada em `/configuracoes` — sem OAuth, sem login do Google, só leitura pública.

### Configurações da empresa (nome da loja, idioma, modo de tema)
Diferente de `/configuracoes` (que é global da plataforma) — isso é por empresa. Leitura pública (`empresa_configuracoes`, RLS pública, pra o player poder aplicar a marca também) é direta no Supabase **quando você já sabe o `empresa_id`**; como o painel do admin logado não tem esse dado de antemão (`membros`/`empresas` não têm policy de leitura pro cliente, de propósito — `empresas` guarda a credencial da Magazord), existe a rota `/me` abaixo pra isso. Uma linha é criada automaticamente com valores padrão quando a empresa é criada.
- **`GET /empresa-configuracoes/me`** — resolve a empresa do usuário logado sozinho (igual `POST /lives`) e devolve a config dela. `404` se o usuário não pertencer a exatamente 1 empresa.
- **`PATCH /empresa-configuracoes/:empresaId`** — atualiza qualquer um de: `nome_loja`, `email_contato`, `fuso_horario`, `idioma`, `logo_url`, `modo_tema` (`claro`/`escuro`/`sistema` — controla qual dos 2 conjuntos de cores abaixo o player usa; `sistema` deixa o player escolher sozinho com base no SO de quem está assistindo).

### Temas da empresa (cores — 1 conjunto claro + 1 conjunto escuro)
Guardado numa tabela própria (`empresa_temas`), separada de `empresa_configuracoes`, porque agora existem **2 conjuntos completos de cores por empresa** — um pro modo claro e um pro modo escuro — em vez de 1 só. Leitura pública (RLS) é direta no Supabase pra quem já sabe o `empresa_id` (o player); o painel usa a rota `/me` abaixo pelo mesmo motivo da seção acima. Duas linhas (`modo: 'claro'` e `modo: 'escuro'`) são criadas automaticamente com valores padrão quando a empresa é criada (o modo escuro já nasce com uma paleta escura de verdade, não é uma cópia do claro).
- **`GET /empresa-temas/me`** — resolve a empresa do usuário logado sozinho e devolve `{ empresa_id, claro, escuro }` (os 2 modos de uma vez). `404` se o usuário não pertencer a exatamente 1 empresa.
- **`PATCH /empresa-temas/:empresaId/:modo`** — `:modo` é `claro` ou `escuro`. Atualiza qualquer um de:
  - Geometria: `border_radius` (`none`/`sm`/`md`/`lg`/`xl`)
  - Botão principal: `primary_color`, `primary_foreground`, `primary_hover`
  - Superfícies: `page_background`, `card_background`, `card_border`
  - Tipografia: `heading_color`, `subheading_color`, `body_text_color`
  - Badges (ex: "AO VIVO", "30% OFF"): `badge_background`, `badge_text`

  Todas as cores são strings livres (hex, ex: `"#dc2626"`) — sem validação de formato, só de presença. Os dois modos são independentes: mudar o `claro` não afeta o `escuro` e vice-versa.

### Painel interno (só `SUPER_ADMIN_EMAILS`)
- **`GET /empresas`**, **`GET /empresas/:id`**, **`POST /empresas`**, **`PATCH /empresas/:id`**, **`DELETE /empresas/:id`** — `magazord_password` nunca volta nas respostas (write-only, fica criptografado no banco).
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

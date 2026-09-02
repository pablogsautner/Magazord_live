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
  10. `010_roleta.sql` — roleta de cupons: tabelas `roletas`, `roleta_itens` (leitura pública) e `roleta_giros` (controle de 1 giro por sessão/IP, sem leitura pública).
  11. `011_desconto_pix.sql` — adiciona `desconto_pix_percentual` em `empresa_configuracoes`, usado pra calcular o preço de Pix exibido na live (a Magazord não expõe isso pela API).
  12. `012_live_stream_webrtc.sql` — `youtube_video_id` vira opcional: lives novas não usam mais YouTube, só o servidor de live próprio (WebRTC).
  13. `013_produto_caracteristicas.sql` — tabela `produto_caracteristicas` (ficha técnica/descrição, leitura pública), populada pelo backend a cada lookup de produto (`GET /produtos/:codigo`).
  14. `014_metricas_lives.sql` — tabela `metricas_lives_snapshot` (histórico de audiência por live, sem leitura pública — só painel interno) + função `metricas_lives_historico` usada por `GET /metricas/historico`.

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
   - `STREAM_*` — só necessário se for usar o servidor de live próprio (WebRTC). `STREAM_SIGNING_SECRET` (gere igual a `ENCRYPTION_KEY`) precisa ser **idêntica** à `HOOKS_SIGNING_SECRET` do serviço de auth na VPS (repo `sereniia-org/test-live-server`) — é o que faz os dois lados confiarem no mesmo token. Sem isso configurado, `POST /live-stream/:liveId/publish-token` falha.
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
- **`GET /produtos/:codigo`** — detalhe + preço + estoque + link da loja num JSON só: `{ produto_codigo, nome, imagem_url, preco, preco_antigo, estoque, url_produto }`. **`estoque` é unificado**: soma o saldo de todas as derivações (cores) ativas do mesmo produto pai, não só da cor recebida em `:codigo` — na Magazord cada cor tem estoque próprio e independente (ex: Branco com 465, Azul com 535), então sem essa soma o número mostrado refletiria só 1 cor entre várias. **`preco` é o preço do Pix**, não o de cartão: a Magazord só retorna pela API o preço "de cartão" (`listPreco`) — o desconto de Pix não é exposto em nenhum endpoint deles (testamos `configuracaoPagamento` e `forma-recebimento`), é config só do checkout/tema da loja. Por isso aplicamos aqui o `desconto_pix_percentual` cadastrado em `/empresa-configuracoes` sobre o preço de cartão. Se a empresa não cadastrar esse %, fica `0` e `preco` sai igual ao de cartão mesmo. **Efeito colateral (de propósito)**: essa chamada também faz upsert em `produto_caracteristicas` (ficha técnica/descrição — ver abaixo) — é o único ponto por onde um produto passa antes de entrar numa live, então é o gancho natural pra manter aquela tabela em dia sem precisar de job de sincronização à parte. Falha nesse upsert é só logada, nunca derruba a resposta do lookup.
- **`produto_caracteristicas`** (tabela, leitura pública direto no Supabase — RLS, sem rota HTTP própria, mesmo padrão de `live_products`/`comentarios`): `{ produto_codigo, id_produto_magazord, titulo, descricao, descricao_resumida, marca, categorias, ean, peso, largura, altura, comprimento, atributos, atualizado_em }`. `atributos` é uma lista `{ nome, valor }` de schema variável por categoria de produto (ex: "Composição", "Gramatura") — guardada como JSONB em vez de normalizada, já que é só pra listar/exibir, não pra filtrar por atributo específico. `descricao` é HTML rico (o mesmo texto da página de produto da própria Magazord). `id_produto_magazord` é o id numérico interno da Magazord (diferente do `produto_codigo`, que é a derivação) — guardado pensando numa etapa futura de avaliações, que são indexadas por esse número; não é usado por nada ainda. Linha ausente pra um `produto_codigo` = esse produto nunca passou por um `GET /produtos/:codigo` (não deveria acontecer com produto já numa live, já que adicionar exige buscar antes).

### Sincronização
- **`POST /sync/live/:liveId`** — revalida preço/estoque dos produtos ativos da live direto na Magazord. Resposta: `{ sincronizados, falhas }`.

### Lives
- **`POST /lives`** — cria uma live. Body: `{ titulo, youtube_video_id? }` — **`youtube_video_id` é opcional**: não é mais pra ter live nova via YouTube (muita gambiarra pra gerenciar o player — tela de "toque pra entrar" travando autoplay, contador de espectador que o YouTube às vezes simplesmente não retorna). Toda live nova é do servidor de live próprio (WebRTC via SRS, ver seção "Servidor de live" abaixo); `youtube_video_id` só continua existindo pra não quebrar lives antigas já criadas. A empresa é resolvida automaticamente pelo vínculo do usuário. `status` começa em `agendada` por padrão (coluna `status` em `lives`, default no banco).
- **`PATCH /lives/:id`** — edita `titulo`, `youtube_video_id` e/ou `status` (manda só o que for mudar). `status` deve ser um de `agendada`/`ao_vivo`/`encerrada` — é o campo que os widgets públicos (tarja, player fullscreen) ficam sondando pra decidir se mostram ou escondem a live.
- **`DELETE /lives/:id`** — apaga a live e (por `ON DELETE CASCADE`) todos os produtos dela.
- **`GET /lives/:id/audiencia`** — pública, sem token. `{ ao_vivo, espectadores }`. **Sensível a qual sistema a live usa**: se tiver `youtube_video_id`, consulta o YouTube (`audienciaAoVivo`); senão, consulta o servidor de live próprio (`audienciaWebrtc`) — nesse caso a contagem é exata e sempre presente (sessões WHEP/RTMP reais no servidor), diferente do YouTube, cujo campo de espectadores frequentemente vem vazio. **Nesse caso a resposta também traz `whep_url`** (ex: `https://live.venderiia.com.br/rtc/v1/whep/?app=live&stream=<id>`), pronto pra usar — o frontend nunca precisa saber a URL do servidor de live "de cor" (não seria escalável: trocar de VPS/região viraria deploy de front). Único ponto onde o navegador do espectador fala direto com o servidor de live em vez de com este backend — inerente ao protocolo WHEP (negociação WebRTC é o próprio navegador, não dá pra passar por proxy do nosso lado sem reimplementar sinalização SDP).
- **`GET /lives/:id/metricas`** — autenticada, tenancy igual `PATCH`/`DELETE` (`403` se não pertence à empresa da live). Diferente de `/audiencia` (tempo real, pública): isso é **histórico** — `{ pico_espectadores, media_espectadores, pontos: [{ capturado_em, espectadores }] }`, lido de `metricas_lives_snapshot` (populada pelo cron de `POST /metricas/capturar`, a cada 3 min — ver seção "Painel interno"). Pro lojista acompanhar audiência ao longo da própria live/depois de encerrada, sem precisar do painel super-admin. Lógica em `services/metricas.js`/`.ts` (`historicoAudienciaLive`), não inline na rota.

### Servidor de live próprio (WebRTC via SRS)
Substitui o YouTube pra lives novas. O vendedor transmite direto do navegador (WHIP) ou via OBS (RTMP) pro servidor SRS (repositório separado, `sereniia-org/test-live-server`); espectadores assistem via WHEP (baixa latência) ou HLS. Publish exige um token assinado; assistir é público (sem token), igual o resto da plataforma — quem tem o link/id da live assiste, sem login.
- **`POST /live-stream/:liveId/publish-token`** — autenticada, mesma checagem de tenancy de sempre (`empresaIdDaLive` + `usuarioPertenceAEmpresa`). Emite um token assinado (HMAC-SHA256, `services/streamAuth.js`/`.ts`) pra iniciar a transmissão dessa live — verificado localmente pelo serviço de auth do servidor de live (sem bater no nosso banco a cada tentativa de conexão, já que o SRS chama isso de forma síncrona). Devolve `{ whip: { url, token, expires_at }, rtmp: { server_url, stream_key, expires_at } }`: WHIP pro navegador (token expira em 5 min — só cobre o handshake de conexão, uma reconexão pede token novo), RTMP pro OBS (token expira em 20 min, já que o OBS não é scriptável do nosso lado pra sempre pedir um novo no reconnect automático). Precisa de `STREAM_SIGNING_SECRET` configurada — tem que ser **exatamente igual** à do serviço de auth na VPS, senão nenhum token é aceito lá.

### Assistir a live no player do frontend (WhepPlayer)
Tem **dois** frontends neste repo: `frontend/` (Vue, MVP inicial) e `livoo-live-shop-web/` (React + TanStack — é o que o Kauan está desenvolvendo de verdade, com comentários/roleta/cupom/produto em destaque já prontos). Nenhum dos dois tem WhepPlayer ainda. O exemplo abaixo é em Vue (mesma stack do `LivePlayer.vue`), mas **o contrato com a API é o mesmo não importa o framework** — é só a parte "3" que muda de sintaxe pra React (hook `useEffect` no lugar de `onMounted`/`onBeforeUnmount`, `useRef` no lugar de `ref`).

Hoje `LivePlayer.vue` sempre renderiza `<YoutubeEmbed :video-id="live.youtube_video_id" />` (a mesma coisa que `YoutubeEmbed` faz no React, em `livoo-live-shop-web/src/components/player/youtube-embed.tsx`). Pra lives novas (sem `youtube_video_id`) o vídeo vem do servidor de live próprio via **WHEP** — não dá pra só trocar a `src` de um `<iframe>`, é um protocolo diferente: o navegador negocia WebRTC direto com o SRS (manda um SDP offer por `POST`, recebe um SDP answer, e o `MediaStream` que chega cai dentro de uma tag `<video>`).

**1. Descobrir qual player usar e pegar a URL do WHEP** — a mesma chamada que já dá o número de espectadores (`GET /lives/:id/audiencia`, pública, sem token — no React já existe via `useLiveAudiencia`) agora também traz `whep_url` quando a live é WebRTC. **O front nunca constrói essa URL sozinho** (não sabe o domínio do servidor de live, nem precisa saber — é exatamente o ponto de ser "escalável": trocar de VPS/região é mudança só no backend, zero deploy de frontend):
```vue
<YoutubeEmbed v-if="live.youtube_video_id" :video-id="live.youtube_video_id" />
<WhepPlayer v-else-if="audiencia?.whep_url" :whep-url="audiencia.whep_url" />
```

**2. `WhepPlayer.vue`** — versão em Vue do `web/assets/whep.js` do repositório `sereniia-org/test-live-server` (mesmo protocolo, já testado e validado em produção: publish → SRS → watch, com vídeo H.264/AAC real chegando no `<video>`). Versão mínima, sem stats/reconexão (pra isso, olha o `whep.js` original, que já tem):
```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({ whepUrl: { type: String, required: true } });
const videoEl = ref(null);
let pc = null;
let resourceUrl = null;

async function conectar() {
  pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  const remote = new MediaStream();
  pc.ontrack = (e) => {
    remote.addTrack(e.track);
    if (videoEl.value.srcObject !== remote) {
      videoEl.value.srcObject = remote;
      videoEl.value.play().catch(() => {});
    }
  };

  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const pronto = () => { pc.removeEventListener('icegatheringstatechange', pronto); resolve(); };
    pc.addEventListener('icegatheringstatechange', pronto);
    setTimeout(resolve, 2500); // não trava pra sempre se o ICE demorar
  });

  const res = await fetch(props.whepUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription.sdp,
  });
  const sdp = await res.text();
  if (!res.ok) throw new Error(`WHEP ${res.status}: ${sdp}`);
  resourceUrl = res.headers.get('Location'); // caminho relativo (ex: /rtc/v1/whep/xxxx)
  await pc.setRemoteDescription({ type: 'answer', sdp });
}

onMounted(conectar);
onBeforeUnmount(async () => {
  try { if (resourceUrl) await fetch(new URL(resourceUrl, props.whepUrl), { method: 'DELETE' }); } catch { /* ignore */ }
  pc?.close();
});
</script>

<template>
  <video ref="videoEl" autoplay playsinline muted class="whep-video" />
</template>

<style scoped>
.whep-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; }
</style>
```

**Duas diferenças importantes em relação a só copiar o `whep.js` original:**
- **`resourceUrl` resolve contra `props.whepUrl` (a própria URL do WHEP, que já é do servidor de live), nunca contra `location.href`** — o `whep.js` original faz `new URL(resource, location.href)` porque a página de debug (`watch.html`) roda no mesmo domínio do servidor de live. Aqui o player vive no domínio da **loja do cliente** (outro domínio); resolver contra `location.href` mandaria o `DELETE` pro lugar errado (a própria loja, não a VPS de live).
- **Não porta o parâmetro `?eip=`** — no `whep.js` original ele existe pra testes locais/LAN (deriva o IP a partir do `hostname` que você abriu no navegador). Embedado numa loja de cliente, `location.hostname` seria o domínio da loja, sem relação nenhuma com o servidor de live — incluir isso seria, na melhor das hipóteses, inútil, e na pior, uma tentativa de ICE candidate errado. O `CANDIDATE` já configurado no `srs.conf` da VPS (IP público dela) já resolve isso sozinho, sem precisar de parâmetro nenhum vindo do navegador ou de env var nenhuma no front.
- **CORS**: o proxy `/rtc/*` do serviço de live já responde `access-control-allow-origin: *` inclusive no preflight `OPTIONS` (fix aplicado e testado em produção — antes disso, chamar o WHEP de um domínio diferente do da VPS falhava silenciosamente no preflight, sem erro claro além de "CORS error" no console).

**Pra transmitir** (o vendedor "ir ao vivo", lado publish) o fluxo é: o frontend chama `POST /live-stream/:liveId/publish-token` autenticado, pega o `whip.url`/`whip.token` da resposta (já vem prontos, mesmo raciocínio do `whep_url` — o front não monta URL nenhuma sozinho), e usa a mesma lógica de `web/assets/whip.js` do `test-live-server` (WHIP em vez de WHEP: `getUserMedia` → oferta SDP → `POST` com o token na query string). Isso ainda não tem um tutorial próprio aqui porque é uma tela nova de admin (não um componente que já existe pra adaptar, como o `LivePlayer.vue`/`YoutubeEmbed`), mas o protocolo e a autenticação já estão prontos e testados — só falta a tela.

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

### Roleta de cupons
Sorteio ponderado por live (cada item tem um `peso`; quanto maior, mais chance). O sorteio roda **no backend**, não no navegador — senão a trava de "1 giro por pessoa" não valeria nada, dava pra forjar o resultado no client. Leitura (`GET`) é pública; escrita de configuração (`PATCH`) exige login e vínculo com a empresa da live, igual o resto.
- **`GET /roleta/:liveId`** — sem token. Retorna `{ live_id, ativa, atualizado_em, itens: [...] }`. `404` se a live não tiver roleta configurada ainda.
- **`PATCH /roleta/:liveId`** — atualiza `ativa` e/ou `itens` (manda só o que for mudar). Quando `itens` é enviado, **substitui a lista inteira** (apaga e recria) — não dá pra editar item a item, é tudo de uma vez. Cada item: `{ tipo: "cupom" | "sem_premio", coupon_id, codigo, descricao, tipo_desconto, valor_desconto, peso }`, `peso` precisa ser maior que zero.
- **`POST /roleta/:liveId/girar`** — sem token. Body: `{ session_id }` (gerado e guardado no `localStorage` de quem assiste, 1 vez por navegador — o front ainda precisa gerar isso). O IP é capturado no próprio backend (`X-Forwarded-For`), não vem do client. Bloqueia um segundo giro pela mesma sessão **ou** pelo mesmo IP (o que vier primeiro trava o outro) — devolve `409 { error: "ja_girou", item }` com o prêmio já sorteado antes, em vez de só um erro seco. Sucesso: `200 { item }`.

### Chat da live (comentários)
Diferente de todo o resto da API — essa é a **primeira rota pública sem autenticação** do sistema, porque quem comenta é o espectador anônimo assistindo pelo player, não um usuário logado da plataforma. Por isso a escrita não é liberada direto no Supabase (evitaria virar porta aberta pra spam/flood): passa por uma rota pública do backend, com validação de tamanho e sob o rate limiting geral.
- **`POST /comentarios`** — **sem token**. Body: `{ live_id, nome, texto }` (`nome`: 1–60 caracteres; `texto`: 1–500 caracteres). `404` se a live não existir.
- Leitura é direta no Supabase (`comentarios`, RLS pública) — o player deve usar **Realtime** (`postgres_changes` filtrando por `live_id`) pra mostrar o chat entrando na hora, sem precisar de polling.

### Audiência ao vivo (YouTube)
- **`GET /lives/:id/audiencia`** — quantas pessoas estão assistindo agora. Resposta: `{ ao_vivo: boolean, espectadores: number | null }` (`espectadores` só vem preenchido quando `ao_vivo` é `true` e o YouTube já informou o número). Usa a `youtube_api_key` cadastrada em `/configuracoes` — sem OAuth, sem login do Google, só leitura pública.

### Configurações da empresa (nome da loja, idioma, modo de tema)
Diferente de `/configuracoes` (que é global da plataforma) — isso é por empresa. Leitura pública (`empresa_configuracoes`, RLS pública, pra o player poder aplicar a marca também) é direta no Supabase **quando você já sabe o `empresa_id`**; como o painel do admin logado não tem esse dado de antemão (`membros`/`empresas` não têm policy de leitura pro cliente, de propósito — `empresas` guarda a credencial da Magazord), existe a rota `/me` abaixo pra isso. Uma linha é criada automaticamente com valores padrão quando a empresa é criada.
- **`GET /empresa-configuracoes/me`** — resolve a empresa do usuário logado sozinho (igual `POST /lives`) e devolve a config dela. `404` se o usuário não pertencer a exatamente 1 empresa.
- **`PATCH /empresa-configuracoes/:empresaId`** — atualiza qualquer um de: `nome_loja`, `email_contato`, `fuso_horario`, `idioma`, `logo_url`, `modo_tema` (`claro`/`escuro`/`sistema` — controla qual dos 2 conjuntos de cores abaixo o player usa; `sistema` deixa o player escolher sozinho com base no SO de quem está assistindo), `desconto_pix_percentual` (número de 0 a 100 — usado por `GET /produtos/:codigo` pra calcular o preço de Pix mostrado na live; ver seção de Produtos acima).

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
- **`GET /metricas?empresa_id=<opcional>`** — visão cross-empresa em tempo real: lives `ao_vivo` agora (com audiência atual, cruzando com o servidor de live) + saúde do servidor (`servidor: { cpu, mem, conns, uptime_s, recv_bytes, send_bytes }`) + um resumo `por_empresa`. Sem `empresa_id`, mostra tudo; com ele, filtra pra uma empresa só (é um filtro pro super-admin fazer drill-down, não um controle de acesso — só super-admin chama isso de qualquer forma).
- **`GET /metricas/historico?horas=24&empresa_id=<opcional>`** — série temporal (uma linha por captura) a partir do que foi salvo em `metricas_lives_snapshot`.
- **`POST /metricas/capturar`** — grava um snapshot agora (lives ao vivo + audiência de cada uma) em `metricas_lives_snapshot`. Aceita **dois jeitos de autorizar**: o header `X-Cron-Secret` (`METRICS_CRON_SECRET`, pro `pg_cron` do Supabase chamar sozinho a cada 3 min — ver `supabase/014_metricas_lives.sql`) **ou** uma sessão de super-admin normal (captura manual "na hora", sem esperar o próximo tick do cron). Histórico só é confiável se a amostragem for regular, por isso a captura de fundo é por tempo (cron), não "toda vez que alguém abre `GET /metricas`" — senão a live mais olhada pareceria artificialmente mais popular. **3 min e não pesa**: a rota já confere `lives.status = 'ao_vivo'` antes de qualquer coisa cara — sem live rodando, é só 1 SELECT indexado e retorna na hora, sem bater no servidor de live. Só fica "cara" (1 chamada ao `/api/summary` + inserts) nos minutos em que tem live de verdade, que é exatamente quando mais pontos importam (uma live curta de 20-30 min só teria 1-2 pontos com o intervalo antigo de 15 min).

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

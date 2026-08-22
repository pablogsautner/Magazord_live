import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono@4/cors';
import { produtosRouter } from './routes/produtos.ts';
import { syncRouter } from './routes/sync.ts';
import { livesRouter } from './routes/lives.ts';
import { liveProductsRouter } from './routes/liveProducts.ts';
import { empresasRouter } from './routes/empresas.ts';
import { usuariosRouter } from './routes/usuarios.ts';
import { membrosRouter } from './routes/membros.ts';

// basePath('/api') porque a função se chama "api" — o Supabase invoca em
// .../functions/v1/api/..., e o Hono precisa saber esse prefixo pra rotear certo.
const app = new Hono().basePath('/api');

app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));
app.route('/produtos', produtosRouter);
app.route('/sync', syncRouter);
app.route('/lives', livesRouter);
app.route('/live-products', liveProductsRouter);

// Painel interno (nosso, não do cliente) — exige usuário autenticado presente em SUPER_ADMIN_EMAILS.
app.route('/empresas', empresasRouter);
app.route('/usuarios', usuariosRouter);
app.route('/membros', membrosRouter);

Deno.serve(app.fetch);

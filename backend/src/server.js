import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { produtosRouter } from './routes/produtos.js';
import { syncRouter } from './routes/sync.js';
import { livesRouter } from './routes/lives.js';
import { liveProductsRouter } from './routes/liveProducts.js';
import { cuponsRouter } from './routes/cupons.js';
import { empresasRouter } from './routes/empresas.js';
import { usuariosRouter } from './routes/usuarios.js';
import { membrosRouter } from './routes/membros.js';
import { configuracoesRouter } from './routes/configuracoes.js';
import { empresaConfiguracoesRouter } from './routes/empresaConfiguracoes.js';
import { empresaTemasRouter } from './routes/empresaTemas.js';
import { comentariosRouter } from './routes/comentarios.js';

const app = express();
app.use(cors());
app.use(express.json());

const limiteGeral = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const limiteInterno = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
app.use(limiteGeral);

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/produtos', produtosRouter);
app.use('/sync', syncRouter);
app.use('/lives', livesRouter);
app.use('/live-products', liveProductsRouter);
app.use('/cupons', cuponsRouter);
app.use('/empresa-configuracoes', empresaConfiguracoesRouter);
app.use('/empresa-temas', empresaTemasRouter);

// Pública de propósito (chat da live) — fica sob o limiteGeral, não requireUser.
app.use('/comentarios', comentariosRouter);

// Painel interno (nosso, não do cliente) — exige usuário autenticado presente em SUPER_ADMIN_EMAILS.
app.use('/empresas', limiteInterno, empresasRouter);
app.use('/usuarios', limiteInterno, usuariosRouter);
app.use('/membros', limiteInterno, membrosRouter);
app.use('/configuracoes', limiteInterno, configuracoesRouter);

app.listen(config.port, () => {
  console.log(`backend rodando em http://localhost:${config.port}`);
});

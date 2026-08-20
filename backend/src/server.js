import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { produtosRouter } from './routes/produtos.js';
import { syncRouter } from './routes/sync.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/produtos', produtosRouter);
app.use('/sync', syncRouter);

app.listen(config.port, () => {
  console.log(`backend rodando em http://localhost:${config.port}`);
});

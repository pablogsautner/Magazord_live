import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { criarCupomDesconto, atualizarCupomDesconto } from '../services/magazord.js';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.js';

export const cuponsRouter = Router();
cuponsRouter.use(requireUser);

const TIPOS_DESCONTO_VALIDOS = ['percentual', 'fixo'];

async function empresaIdDoCupom(cupomId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('cupons').select('live_id, lives(empresa_id)').eq('id', cupomId).single();
  if (error) throw error;
  return data.lives.empresa_id;
}

cuponsRouter.post('/', async (req, res) => {
  const { live_id, codigo, descricao, tipo_desconto, valor_desconto, valido_de, valido_ate, valor_minimo_pedido } = req.body;

  if (!live_id || !codigo || !tipo_desconto || valor_desconto === undefined || !valido_de || !valido_ate) {
    return res.status(400).json({ error: 'campos_obrigatorios_faltando' });
  }
  if (!TIPOS_DESCONTO_VALIDOS.includes(tipo_desconto)) {
    return res.status(400).json({ error: 'tipo_desconto_invalido', message: `tipo_desconto deve ser um de: ${TIPOS_DESCONTO_VALIDOS.join(', ')}` });
  }

  const empresaId = await empresaIdDaLive(live_id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  let cupomMagazord;
  try {
    cupomMagazord = await criarCupomDesconto({
      codigo,
      descricao,
      tipoDesconto: tipo_desconto,
      valorDesconto: valor_desconto,
      validoDe: valido_de,
      validoAte: valido_ate,
      valorMinimoPedido: valor_minimo_pedido,
    });
  } catch (err) {
    return res.status(502).json({ error: 'magazord_criar_cupom_failed', message: err.message });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cupons')
    .insert({
      live_id,
      magazord_cupom_id: cupomMagazord?.id ?? null,
      codigo,
      descricao,
      tipo_desconto,
      valor_desconto,
      valido_de,
      valido_ate,
      valor_minimo_pedido,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message });
  res.status(201).json(data);
});

cuponsRouter.patch('/:id', async (req, res) => {
  const empresaId = await empresaIdDoCupom(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'cupom_nao_encontrado' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const supabase = getSupabase();
  const { data: cupom, error: erroCupom } = await supabase
    .from('cupons')
    .select('magazord_cupom_id')
    .eq('id', req.params.id)
    .single();
  if (erroCupom) return res.status(404).json({ error: 'cupom_nao_encontrado' });

  const { ativo, descricao, valido_ate } = req.body;
  const campos = {};
  if (typeof ativo === 'boolean') campos.ativo = ativo;
  if (descricao !== undefined) campos.descricao = descricao;
  if (valido_ate !== undefined) campos.valido_ate = valido_ate;
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: 'nenhum_campo_valido' });
  }

  if (cupom.magazord_cupom_id) {
    const campoMagazord = {};
    if (campos.ativo !== undefined) campoMagazord.ativo = campos.ativo;
    if (campos.descricao !== undefined) campoMagazord.descricao = campos.descricao;
    if (campos.valido_ate !== undefined) campoMagazord.validoAte = campos.valido_ate;
    try {
      await atualizarCupomDesconto(cupom.magazord_cupom_id, campoMagazord);
    } catch (err) {
      return res.status(502).json({ error: 'magazord_atualizar_cupom_failed', message: err.message });
    }
  }

  const { data, error } = await supabase.from('cupons').update(campos).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.json(data);
});

// A Magazord não tem endpoint de excluir cupom — "remover" aqui é desativar
// nos dois lados (lá e no nosso registro), igual já fazemos com produto/live.
cuponsRouter.delete('/:id', async (req, res) => {
  const empresaId = await empresaIdDoCupom(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'cupom_nao_encontrado' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const supabase = getSupabase();
  const { data: cupom, error: erroCupom } = await supabase
    .from('cupons')
    .select('magazord_cupom_id')
    .eq('id', req.params.id)
    .single();
  if (erroCupom) return res.status(404).json({ error: 'cupom_nao_encontrado' });

  if (cupom.magazord_cupom_id) {
    try {
      await atualizarCupomDesconto(cupom.magazord_cupom_id, { ativo: false });
    } catch (err) {
      return res.status(502).json({ error: 'magazord_desativar_cupom_failed', message: err.message });
    }
  }

  const { error } = await supabase.from('cupons').update({ ativo: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.status(204).end();
});

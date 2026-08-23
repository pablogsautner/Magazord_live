import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { usuarioPertenceAEmpresa } from '../services/tenancy.js';

export const empresaConfiguracoesRouter = Router();
empresaConfiguracoesRouter.use(requireUser);

const CAMPOS_VALIDOS = [
  'nome_loja',
  'email_contato',
  'fuso_horario',
  'idioma',
  'cor_primaria',
  'cor_destaque',
  'raio_borda',
  'logo_url',
  'modo_tema',
];
const RAIOS_VALIDOS = ['none', 'sm', 'md', 'lg', 'xl'];
const MODOS_VALIDOS = ['claro', 'escuro', 'sistema'];

empresaConfiguracoesRouter.patch('/:empresaId', async (req, res) => {
  if (!(await usuarioPertenceAEmpresa(req.user.id, req.params.empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const campos = {};
  for (const chave of CAMPOS_VALIDOS) {
    if (req.body[chave] !== undefined) campos[chave] = req.body[chave];
  }
  if (campos.raio_borda !== undefined && !RAIOS_VALIDOS.includes(campos.raio_borda)) {
    return res.status(400).json({ error: 'raio_borda_invalido', message: `deve ser um de: ${RAIOS_VALIDOS.join(', ')}` });
  }
  if (campos.modo_tema !== undefined && !MODOS_VALIDOS.includes(campos.modo_tema)) {
    return res.status(400).json({ error: 'modo_tema_invalido', message: `deve ser um de: ${MODOS_VALIDOS.join(', ')}` });
  }
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: 'nenhum_campo_valido' });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresa_configuracoes')
    .update(campos)
    .eq('empresa_id', req.params.empresaId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.json(data);
});

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
  'logo_url',
  'modo_tema',
  // Geometria
  'border_radius',
  // Cor da marca e botões
  'primary_color',
  'primary_foreground',
  'primary_hover',
  // Superfícies e bordas
  'page_background',
  'card_background',
  'card_border',
  // Tipografia e textos
  'heading_color',
  'subheading_color',
  'body_text_color',
  // Destaques e badges
  'badge_background',
  'badge_text',
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
  if (campos.border_radius !== undefined && !RAIOS_VALIDOS.includes(campos.border_radius)) {
    return res.status(400).json({ error: 'border_radius_invalido', message: `deve ser um de: ${RAIOS_VALIDOS.join(', ')}` });
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

import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaUnicaDoUsuario, usuarioPertenceAEmpresa } from '../services/tenancy.js';
import { TEMA_PADRAO_CLARO, TEMA_PADRAO_ESCURO } from '../services/temas.js';

export const empresaTemasRouter = Router();
empresaTemasRouter.use(requireUser);

const CAMPOS_VALIDOS = [
  'border_radius',
  'primary_color',
  'primary_foreground',
  'primary_hover',
  'page_background',
  'card_background',
  'card_border',
  'heading_color',
  'subheading_color',
  'body_text_color',
  'badge_background',
  'badge_text',
];
const RAIOS_VALIDOS = ['none', 'sm', 'md', 'lg', 'xl'];
const MODOS_VALIDOS = ['claro', 'escuro'];

// O front não tem como descobrir seu próprio empresa_id sozinho (membros/
// empresas não têm policy de leitura pro cliente), então resolve aqui do
// mesmo jeito que POST /lives já faz, e devolve os 2 modos de uma vez.
empresaTemasRouter.get('/me', async (req, res) => {
  const empresaId = await empresaUnicaDoUsuario(req.user.id);
  if (!empresaId) return res.status(404).json({ error: 'empresa_nao_encontrada' });

  const supabase = getSupabase();
  const { data, error } = await supabase.from('empresa_temas').select().eq('empresa_id', empresaId);
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });

  // Fallback pra paleta padrão da plataforma se faltar linha — não deveria
  // acontecer (POST /empresas sempre cria os 2 modos na hora), mas cobre
  // dado legado/incompleto em vez de devolver 404 e travar a tela de edição.
  const claro = data.find((tema) => tema.modo === 'claro') ?? { empresa_id: empresaId, modo: 'claro', ...TEMA_PADRAO_CLARO };
  const escuro = data.find((tema) => tema.modo === 'escuro') ?? { empresa_id: empresaId, modo: 'escuro', ...TEMA_PADRAO_ESCURO };

  res.json({ empresa_id: empresaId, claro, escuro });
});

empresaTemasRouter.patch('/:empresaId/:modo', async (req, res) => {
  const { empresaId, modo } = req.params;

  if (!MODOS_VALIDOS.includes(modo)) {
    return res.status(400).json({ error: 'modo_invalido', message: `deve ser um de: ${MODOS_VALIDOS.join(', ')}` });
  }
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const campos = {};
  for (const chave of CAMPOS_VALIDOS) {
    if (req.body[chave] !== undefined) campos[chave] = req.body[chave];
  }
  if (campos.border_radius !== undefined && !RAIOS_VALIDOS.includes(campos.border_radius)) {
    return res.status(400).json({ error: 'border_radius_invalido', message: `deve ser um de: ${RAIOS_VALIDOS.join(', ')}` });
  }
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: 'nenhum_campo_valido' });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresa_temas')
    .update(campos)
    .eq('empresa_id', empresaId)
    .eq('modo', modo)
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.json(data);
});

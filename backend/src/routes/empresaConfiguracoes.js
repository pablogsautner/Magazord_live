import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaUnicaDoUsuario, usuarioPertenceAEmpresa } from '../services/tenancy.js';

export const empresaConfiguracoesRouter = Router();
empresaConfiguracoesRouter.use(requireUser);

const CAMPOS_VALIDOS = ['nome_loja', 'email_contato', 'fuso_horario', 'idioma', 'logo_url', 'modo_tema', 'desconto_pix_percentual'];
const MODOS_VALIDOS = ['claro', 'escuro', 'sistema'];

// Precisa vir antes de "/:empresaId" — senão "me" seria interpretado como um
// empresaId. O front não tem como descobrir seu próprio empresa_id sozinho
// (membros/empresas não têm policy de leitura pro cliente), então resolve
// aqui do mesmo jeito que POST /lives já faz.
empresaConfiguracoesRouter.get('/me', async (req, res) => {
  const empresaId = await empresaUnicaDoUsuario(req.user.id);
  if (!empresaId) return res.status(404).json({ error: 'empresa_nao_encontrada' });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresa_configuracoes')
    .select()
    .eq('empresa_id', empresaId)
    .single();
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });
  res.json(data);
});

empresaConfiguracoesRouter.patch('/:empresaId', async (req, res) => {
  if (!(await usuarioPertenceAEmpresa(req.user.id, req.params.empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const campos = {};
  for (const chave of CAMPOS_VALIDOS) {
    if (req.body[chave] !== undefined) campos[chave] = req.body[chave];
  }
  if (campos.modo_tema !== undefined && !MODOS_VALIDOS.includes(campos.modo_tema)) {
    return res.status(400).json({ error: 'modo_tema_invalido', message: `deve ser um de: ${MODOS_VALIDOS.join(', ')}` });
  }
  if (
    campos.desconto_pix_percentual !== undefined &&
    (typeof campos.desconto_pix_percentual !== 'number' || campos.desconto_pix_percentual < 0 || campos.desconto_pix_percentual > 100)
  ) {
    return res.status(400).json({ error: 'desconto_pix_percentual_invalido', message: 'deve ser um número entre 0 e 100' });
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

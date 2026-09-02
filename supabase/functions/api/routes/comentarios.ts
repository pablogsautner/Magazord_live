import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaIdDoComentario, usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const comentariosRouter = new Hono();

// Rota pública de propósito: quem comenta no chat da live é o espectador
// anônimo assistindo pelo player, não um usuário logado da plataforma.
comentariosRouter.post('/', async (c) => {
  const { live_id, nome, texto } = await c.req.json();

  if (!live_id || typeof nome !== 'string' || typeof texto !== 'string') {
    return c.json({ error: 'campos_obrigatorios_faltando' }, 400);
  }

  const nomeAparado = nome.trim();
  const textoAparado = texto.trim();
  if (nomeAparado.length < 1 || nomeAparado.length > 60) {
    return c.json({ error: 'nome_invalido', message: 'nome deve ter entre 1 e 60 caracteres' }, 400);
  }
  if (textoAparado.length < 1 || textoAparado.length > 500) {
    return c.json({ error: 'texto_invalido', message: 'texto deve ter entre 1 e 500 caracteres' }, 400);
  }

  const supabase = getSupabase();

  const { data: live, error: erroLive } = await supabase.from('lives').select('id').eq('id', live_id).single();
  if (erroLive || !live) return c.json({ error: 'live_nao_encontrada' }, 404);

  const { data, error } = await supabase
    .from('comentarios')
    .insert({ live_id, nome: nomeAparado, texto: textoAparado })
    .select()
    .single();
  if (error) return c.json({ error: 'insert_failed', message: error.message }, 500);
  return c.json(data, 201);
});

// Moderação: quem gerencia a live apaga um comentário impróprio. Único ponto
// deste router que exige login — POST acima continua público de propósito.
comentariosRouter.delete('/:id', requireUser, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDoComentario(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'comentario_nao_encontrado' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('comentarios').delete().eq('id', id);
  if (error) return c.json({ error: 'delete_failed', message: error.message }, 500);
  return c.body(null, 204);
});

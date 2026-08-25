import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';

export const comentariosRouter = Router();

// Rota pública de propósito: quem comenta no chat da live é o espectador
// anônimo assistindo pelo player, não um usuário logado da plataforma.
comentariosRouter.post('/', async (req, res) => {
  const { live_id, nome, texto } = req.body;

  if (!live_id || typeof nome !== 'string' || typeof texto !== 'string') {
    return res.status(400).json({ error: 'campos_obrigatorios_faltando' });
  }

  const nomeAparado = nome.trim();
  const textoAparado = texto.trim();
  if (nomeAparado.length < 1 || nomeAparado.length > 60) {
    return res.status(400).json({ error: 'nome_invalido', message: 'nome deve ter entre 1 e 60 caracteres' });
  }
  if (textoAparado.length < 1 || textoAparado.length > 500) {
    return res.status(400).json({ error: 'texto_invalido', message: 'texto deve ter entre 1 e 500 caracteres' });
  }

  const supabase = getSupabase();

  const { data: live, error: erroLive } = await supabase.from('lives').select('id').eq('id', live_id).single();
  if (erroLive || !live) return res.status(404).json({ error: 'live_nao_encontrada' });

  const { data, error } = await supabase
    .from('comentarios')
    .insert({ live_id, nome: nomeAparado, texto: textoAparado })
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message });
  res.status(201).json(data);
});

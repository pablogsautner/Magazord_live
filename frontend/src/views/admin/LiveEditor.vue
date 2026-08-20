<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../lib/supabase.js';

const props = defineProps({
  id: { type: String, required: true },
});

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

const produtos = ref([]);
const codigoBusca = ref('');
const preview = ref(null);
const urlProduto = ref('');
const buscando = ref(false);
const erroBusca = ref('');
const sincronizando = ref(false);

async function carregarProdutos() {
  const { data } = await supabase
    .from('live_products')
    .select('*')
    .eq('live_id', props.id)
    .order('ordem');
  produtos.value = data ?? [];
}

async function buscarProduto() {
  erroBusca.value = '';
  preview.value = null;
  if (!codigoBusca.value) return;
  buscando.value = true;
  try {
    const res = await fetch(`${BACKEND_URL}/produtos/${encodeURIComponent(codigoBusca.value)}`, {
      headers: { 'x-admin-key': ADMIN_API_KEY },
    });
    if (!res.ok) throw new Error((await res.json()).message ?? 'Produto não encontrado');
    preview.value = await res.json();
  } catch (err) {
    erroBusca.value = err.message;
  } finally {
    buscando.value = false;
  }
}

async function adicionarProduto() {
  if (!preview.value || !urlProduto.value) return;
  const proximaOrdem = produtos.value.length;
  const { data, error } = await supabase
    .from('live_products')
    .insert({ ...preview.value, live_id: props.id, url_produto: urlProduto.value, ordem: proximaOrdem })
    .select()
    .single();
  if (error) return alert(error.message);
  produtos.value.push(data);
  preview.value = null;
  codigoBusca.value = '';
  urlProduto.value = '';
}

async function atualizar(produto, campos) {
  const { error } = await supabase.from('live_products').update(campos).eq('id', produto.id);
  if (error) return alert(error.message);
  Object.assign(produto, campos);
}

async function remover(produto) {
  const { error } = await supabase.from('live_products').delete().eq('id', produto.id);
  if (error) return alert(error.message);
  produtos.value = produtos.value.filter((p) => p.id !== produto.id);
}

async function sincronizar() {
  sincronizando.value = true;
  try {
    const res = await fetch(`${BACKEND_URL}/sync/live/${props.id}`, {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_API_KEY },
    });
    if (!res.ok) throw new Error('Falha ao sincronizar');
    await carregarProdutos();
  } catch (err) {
    alert(err.message);
  } finally {
    sincronizando.value = false;
  }
}

onMounted(carregarProdutos);
</script>

<template>
  <div class="page">
    <RouterLink to="/admin/lives">← Lives</RouterLink>
    <h1>Produtos da live</h1>

    <div class="busca">
      <input v-model="codigoBusca" placeholder="Código do produto na Magazord" @keyup.enter="buscarProduto" />
      <button :disabled="buscando" @click="buscarProduto">Buscar</button>
    </div>
    <p v-if="erroBusca" class="erro">{{ erroBusca }}</p>

    <div v-if="preview" class="preview">
      <img :src="preview.imagem_url" :alt="preview.nome" />
      <div>
        <p>{{ preview.nome }}</p>
        <p>R$ {{ preview.preco }} · estoque: {{ preview.estoque }}</p>
        <input v-model="urlProduto" placeholder="URL da página do produto na loja" />
        <button @click="adicionarProduto">Adicionar à live</button>
      </div>
    </div>

    <button class="sync" :disabled="sincronizando" @click="sincronizar">
      {{ sincronizando ? 'Sincronizando…' : 'Sincronizar preço/estoque' }}
    </button>

    <ul class="lista">
      <li v-for="produto in produtos" :key="produto.id">
        <img :src="produto.imagem_url" :alt="produto.nome" />
        <div class="info">
          <strong>{{ produto.nome }}</strong>
          <span>R$ {{ produto.preco }} · estoque: {{ produto.estoque }}</span>
        </div>
        <label><input type="checkbox" :checked="produto.ativo" @change="atualizar(produto, { ativo: $event.target.checked })" /> Ativo</label>
        <label><input type="checkbox" :checked="produto.destaque" @change="atualizar(produto, { destaque: $event.target.checked })" /> Destaque</label>
        <button class="remover" @click="remover(produto)">Remover</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page { max-width: 640px; margin: 0 auto; padding: 1.5rem; font-family: system-ui, sans-serif; }
.busca { display: flex; gap: 0.5rem; margin: 1rem 0 0; }
.busca input { flex: 1; padding: 0.5rem; }
.erro { color: #c0392b; font-size: 0.85rem; }
.preview { display: flex; gap: 0.75rem; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem; margin-top: 0.75rem; }
.preview img { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; }
.preview input { width: 100%; padding: 0.4rem; margin: 0.4rem 0; }
.sync { margin: 1rem 0; }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.lista li { display: flex; align-items: center; gap: 0.6rem; border: 1px solid #eee; border-radius: 8px; padding: 0.5rem; }
.lista img { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
.info { flex: 1; display: flex; flex-direction: column; font-size: 0.85rem; }
.remover { margin-left: auto; color: #c0392b; background: none; border: none; cursor: pointer; }
</style>

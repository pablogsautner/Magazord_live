<script setup>
import { ref, watch, onMounted } from 'vue';
import { supabase } from '../../lib/supabase.js';

const props = defineProps({
  id: { type: String, required: true },
});

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

const produtos = ref([]);
const nomeBusca = ref('');
const sugestoes = ref([]);
const buscandoSugestoes = ref(false);
const preview = ref(null);
const buscando = ref(false);
const erroBusca = ref('');
const sincronizando = ref(false);
let debounceTimer = null;

watch(nomeBusca, (valor) => {
  preview.value = null;
  clearTimeout(debounceTimer);
  if (valor.trim().length < 3) {
    sugestoes.value = [];
    return;
  }
  debounceTimer = setTimeout(() => buscarSugestoes(valor.trim()), 300);
});

async function buscarSugestoes(nome) {
  buscandoSugestoes.value = true;
  try {
    const res = await fetch(`${BACKEND_URL}/produtos/buscar?nome=${encodeURIComponent(nome)}`, {
      headers: { 'x-admin-key': ADMIN_API_KEY },
    });
    sugestoes.value = res.ok ? await res.json() : [];
  } finally {
    buscandoSugestoes.value = false;
  }
}

async function selecionarSugestao(opcao) {
  sugestoes.value = [];
  nomeBusca.value = opcao.nome;
  await buscarProduto(opcao.codigo);
}

async function carregarProdutos() {
  const { data } = await supabase
    .from('live_products')
    .select('*')
    .eq('live_id', props.id)
    .order('ordem');
  produtos.value = data ?? [];
}

async function buscarProduto(codigo) {
  erroBusca.value = '';
  preview.value = null;
  buscando.value = true;
  try {
    const res = await fetch(`${BACKEND_URL}/produtos/${encodeURIComponent(codigo)}`, {
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
  if (!preview.value?.url_produto) return;
  const proximaOrdem = produtos.value.length;
  const { data, error } = await supabase
    .from('live_products')
    .insert({ ...preview.value, live_id: props.id, ordem: proximaOrdem })
    .select()
    .single();
  if (error) return alert(error.message);
  produtos.value.push(data);
  preview.value = null;
  nomeBusca.value = '';
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
      <input v-model="nomeBusca" placeholder="Digite o nome do produto (mín. 3 letras)" autocomplete="off" />
      <span v-if="buscandoSugestoes" class="buscando-indicador">buscando…</span>
      <ul v-if="sugestoes.length" class="sugestoes">
        <li v-for="opcao in sugestoes" :key="opcao.codigo" @click="selecionarSugestao(opcao)">
          {{ opcao.nome }}
        </li>
      </ul>
    </div>
    <p v-if="erroBusca" class="erro">{{ erroBusca }}</p>
    <p v-if="buscando" class="carregando">Carregando produto…</p>

    <div v-if="preview" class="preview">
      <img :src="preview.imagem_url" :alt="preview.nome" />
      <div>
        <p>{{ preview.nome }}</p>
        <p>R$ {{ preview.preco }} · estoque: {{ preview.estoque }}</p>
        <a v-if="preview.url_produto" :href="preview.url_produto" target="_blank" class="link-produto">{{ preview.url_produto }}</a>
        <p v-else class="erro">Não achei o link desse produto na loja — confere manualmente antes de adicionar.</p>
        <button :disabled="!preview.url_produto" @click="adicionarProduto">Adicionar à live</button>
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
.busca { position: relative; margin: 1rem 0 0; }
.busca input { width: 100%; padding: 0.5rem; box-sizing: border-box; }
.buscando-indicador { position: absolute; right: 0.6rem; top: 0.6rem; font-size: 0.75rem; color: #888; }
.sugestoes {
  position: absolute;
  z-index: 10;
  top: 100%;
  left: 0;
  right: 0;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  max-height: 260px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.sugestoes li { padding: 0.5rem 0.7rem; font-size: 0.85rem; cursor: pointer; border-bottom: 1px solid #f0f0f0; }
.sugestoes li:last-child { border-bottom: none; }
.sugestoes li:hover { background: #f5f5f5; }
.erro { color: #c0392b; font-size: 0.85rem; }
.carregando { color: #888; font-size: 0.85rem; }
.preview { display: flex; gap: 0.75rem; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem; margin-top: 0.75rem; }
.preview img { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; }
.link-produto { display: block; font-size: 0.75rem; color: #2563eb; margin: 0.3rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px; }
.sync { margin: 1rem 0; }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.lista li { display: flex; align-items: center; gap: 0.6rem; border: 1px solid #eee; border-radius: 8px; padding: 0.5rem; }
.lista img { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
.info { flex: 1; display: flex; flex-direction: column; font-size: 0.85rem; }
.remover { margin-left: auto; color: #c0392b; background: none; border: none; cursor: pointer; }
</style>

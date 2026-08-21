<script setup>
import { ref, onMounted } from 'vue';
import { backendFetch } from '../../lib/backend.js';

const empresas = ref([]);
const carregando = ref(true);
const semAcesso = ref(false);
const erro = ref('');

const form = ref({
  nome: '',
  magazord_base_url: '',
  magazord_user: '',
  magazord_password: '',
  magazord_tabela_preco_id: '1',
  magazord_loja_id: '1',
  magazord_storefront_url: '',
});
const criando = ref(false);

async function carregar() {
  carregando.value = true;
  semAcesso.value = false;
  const res = await backendFetch('/empresas');
  if (res.status === 401 || res.status === 403) {
    semAcesso.value = true;
  } else if (res.ok) {
    empresas.value = await res.json();
  }
  carregando.value = false;
}

async function criar() {
  erro.value = '';
  criando.value = true;
  const res = await backendFetch('/empresas', { method: 'POST', body: JSON.stringify(form.value) });
  criando.value = false;
  if (!res.ok) {
    erro.value = (await res.json()).message ?? 'Falha ao criar empresa';
    return;
  }
  const nova = await res.json();
  empresas.value.unshift(nova);
  form.value = {
    nome: '',
    magazord_base_url: '',
    magazord_user: '',
    magazord_password: '',
    magazord_tabela_preco_id: '1',
    magazord_loja_id: '1',
    magazord_storefront_url: '',
  };
}

onMounted(carregar);
</script>

<template>
  <div class="page">
    <RouterLink to="/admin/lives">← Lives</RouterLink>
    <h1>Painel interno — Empresas</h1>

    <div v-if="carregando" class="aviso">Carregando…</div>

    <div v-else-if="semAcesso" class="aviso erro">
      Você não tem acesso a essa área. Fale com quem administra o sistema se acha que deveria ter.
    </div>

    <template v-else>
      <form class="form" @submit.prevent="criar">
        <h2>Nova empresa</h2>
        <input v-model="form.nome" placeholder="Nome" required />
        <input v-model="form.magazord_base_url" placeholder="URL base da API Magazord" required />
        <input v-model="form.magazord_user" placeholder="Usuário da API Magazord" required />
        <input v-model="form.magazord_password" type="password" placeholder="Senha da API Magazord" required />
        <div class="linha">
          <input v-model="form.magazord_tabela_preco_id" placeholder="ID tabela de preço" />
          <input v-model="form.magazord_loja_id" placeholder="ID da loja" />
        </div>
        <input v-model="form.magazord_storefront_url" placeholder="URL da loja (ex: https://cliente.com.br)" required />
        <button :disabled="criando" type="submit">{{ criando ? 'Criando…' : 'Criar empresa' }}</button>
      </form>
      <p v-if="erro" class="aviso erro">{{ erro }}</p>

      <ul class="lista">
        <li v-for="empresa in empresas" :key="empresa.id">
          <div>
            <strong>{{ empresa.nome }}</strong>
            <span class="status">{{ empresa.ativa ? 'ativa' : 'inativa' }}</span>
          </div>
          <code>{{ empresa.magazord_storefront_url }}</code>
          <RouterLink :to="`/super-admin/empresas/${empresa.id}`">Gerenciar →</RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 640px; margin: 0 auto; padding: 1.5rem; font-family: system-ui, sans-serif; }
.aviso { margin-top: 1rem; color: #666; }
.aviso.erro { color: #c0392b; }
.form { display: flex; flex-direction: column; gap: 0.5rem; border: 1px solid #eee; border-radius: 8px; padding: 0.75rem; margin-top: 1rem; }
.form h2 { margin: 0 0 0.25rem; font-size: 1rem; }
.form input { padding: 0.5rem; }
.linha { display: flex; gap: 0.5rem; }
.linha input { flex: 1; }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
.lista li { border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem; }
.status { margin-left: 0.5rem; font-size: 0.75rem; color: #888; }
code { display: block; font-size: 0.75rem; color: #888; margin: 0.25rem 0; }
</style>

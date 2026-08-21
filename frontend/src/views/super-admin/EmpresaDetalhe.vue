<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { backendFetch } from '../../lib/backend.js';

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const empresa = ref(null);
const salvando = ref(false);
const membros = ref([]);
const usuarios = ref([]);

const novoUsuarioEmail = ref('');
const novoUsuarioSenha = ref('');
const criandoUsuario = ref(false);
const erroUsuario = ref('');

const usuarioParaVincular = ref('');
const papelParaVincular = ref('admin');

async function carregarEmpresa() {
  const res = await backendFetch(`/empresas/${props.id}`);
  if (res.ok) empresa.value = await res.json();
}

async function carregarMembros() {
  const res = await backendFetch(`/membros?empresa_id=${props.id}`);
  if (res.ok) membros.value = await res.json();
}

async function carregarUsuarios() {
  const res = await backendFetch('/usuarios');
  if (res.ok) usuarios.value = await res.json();
}

async function salvar() {
  salvando.value = true;
  const { magazord_password, ...resto } = empresa.value;
  const campos = magazord_password ? { ...resto, magazord_password } : resto;
  const res = await backendFetch(`/empresas/${props.id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  salvando.value = false;
  if (!res.ok) return alert((await res.json()).message ?? 'Falha ao salvar');
  empresa.value = await res.json();
}

async function excluirEmpresa() {
  if (!confirm('Excluir esta empresa e desvincular todos os membros dela?')) return;
  const res = await backendFetch(`/empresas/${props.id}`, { method: 'DELETE' });
  if (!res.ok) return alert('Falha ao excluir');
  router.push('/super-admin/empresas');
}

async function criarEVincularUsuario() {
  erroUsuario.value = '';
  criandoUsuario.value = true;
  const resUsuario = await backendFetch('/usuarios', {
    method: 'POST',
    body: JSON.stringify({ email: novoUsuarioEmail.value, password: novoUsuarioSenha.value }),
  });
  if (!resUsuario.ok) {
    criandoUsuario.value = false;
    erroUsuario.value = (await resUsuario.json()).message ?? 'Falha ao criar usuário';
    return;
  }
  const usuario = await resUsuario.json();
  await vincular(usuario.id, 'admin');
  novoUsuarioEmail.value = '';
  novoUsuarioSenha.value = '';
  criandoUsuario.value = false;
  await carregarUsuarios();
}

async function vincular(userId, papel) {
  const res = await backendFetch('/membros', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, empresa_id: props.id, papel }),
  });
  if (!res.ok) return alert((await res.json()).message ?? 'Falha ao vincular');
  await carregarMembros();
}

async function vincularExistente() {
  if (!usuarioParaVincular.value) return;
  await vincular(usuarioParaVincular.value, papelParaVincular.value);
  usuarioParaVincular.value = '';
}

async function desvincular(membro) {
  if (!confirm(`Remover ${membro.email} dessa empresa?`)) return;
  const res = await backendFetch(`/membros/${membro.id}`, { method: 'DELETE' });
  if (!res.ok) return alert('Falha ao desvincular');
  membros.value = membros.value.filter((m) => m.id !== membro.id);
}

onMounted(() => {
  carregarEmpresa();
  carregarMembros();
  carregarUsuarios();
});
</script>

<template>
  <div class="page">
    <RouterLink to="/super-admin/empresas">← Empresas</RouterLink>

    <template v-if="empresa">
      <h1>{{ empresa.nome }}</h1>

      <form class="form" @submit.prevent="salvar">
        <input v-model="empresa.nome" placeholder="Nome" />
        <input v-model="empresa.magazord_base_url" placeholder="URL base da API Magazord" />
        <input v-model="empresa.magazord_user" placeholder="Usuário da API Magazord" />
        <input v-model="empresa.magazord_password" type="password" placeholder="Nova senha (deixe em branco pra manter)" />
        <div class="linha">
          <input v-model="empresa.magazord_tabela_preco_id" placeholder="ID tabela de preço" />
          <input v-model="empresa.magazord_loja_id" placeholder="ID da loja" />
        </div>
        <input v-model="empresa.magazord_storefront_url" placeholder="URL da loja" />
        <label><input type="checkbox" v-model="empresa.ativa" /> Ativa</label>
        <div class="linha">
          <button :disabled="salvando" type="submit">{{ salvando ? 'Salvando…' : 'Salvar' }}</button>
          <button type="button" class="excluir" @click="excluirEmpresa">Excluir empresa</button>
        </div>
      </form>

      <h2>Membros</h2>
      <ul class="lista">
        <li v-for="membro in membros" :key="membro.id">
          <span>{{ membro.email }}</span>
          <span class="papel">{{ membro.papel }}</span>
          <button class="remover" @click="desvincular(membro)">Remover</button>
        </li>
        <li v-if="!membros.length" class="vazio">Nenhum membro vinculado ainda.</li>
      </ul>

      <div class="vincular">
        <select v-model="usuarioParaVincular">
          <option disabled value="">Vincular usuário existente…</option>
          <option v-for="u in usuarios" :key="u.id" :value="u.id">{{ u.email }}</option>
        </select>
        <select v-model="papelParaVincular">
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
        <button @click="vincularExistente">Vincular</button>
      </div>

      <form class="form" @submit.prevent="criarEVincularUsuario">
        <h3>Ou criar um usuário novo e já vincular</h3>
        <input v-model="novoUsuarioEmail" type="email" placeholder="Email" required />
        <input v-model="novoUsuarioSenha" type="password" placeholder="Senha" required />
        <button :disabled="criandoUsuario" type="submit">{{ criandoUsuario ? 'Criando…' : 'Criar e vincular' }}</button>
      </form>
      <p v-if="erroUsuario" class="aviso erro">{{ erroUsuario }}</p>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 640px; margin: 0 auto; padding: 1.5rem; font-family: system-ui, sans-serif; }
.form { display: flex; flex-direction: column; gap: 0.5rem; border: 1px solid #eee; border-radius: 8px; padding: 0.75rem; margin-top: 1rem; }
.form h3 { margin: 0 0 0.25rem; font-size: 0.85rem; color: #666; }
.form input { padding: 0.5rem; }
.linha { display: flex; gap: 0.5rem; }
.linha input, .linha select { flex: 1; }
.excluir { color: #c0392b; background: none; border: 1px solid #c0392b; border-radius: 6px; cursor: pointer; }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
.lista li { display: flex; align-items: center; gap: 0.6rem; border: 1px solid #eee; border-radius: 8px; padding: 0.5rem; }
.papel { font-size: 0.75rem; color: #888; }
.remover { margin-left: auto; color: #c0392b; background: none; border: none; cursor: pointer; }
.vazio { color: #888; font-size: 0.85rem; border: none; padding: 0; }
.vincular { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.vincular select { padding: 0.5rem; }
.aviso.erro { color: #c0392b; font-size: 0.85rem; }
</style>

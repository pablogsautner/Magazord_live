<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../../lib/supabase.js';
import { backendFetch } from '../../lib/backend.js';

const router = useRouter();
const lives = ref([]);
const titulo = ref('');
const youtubeId = ref('');
const erroCriar = ref('');

async function carregar() {
  const { data } = await supabase.from('lives').select('*').order('created_at', { ascending: false });
  lives.value = data ?? [];
}

async function criar() {
  if (!titulo.value || !youtubeId.value) return;
  erroCriar.value = '';
  const res = await backendFetch('/lives', {
    method: 'POST',
    body: JSON.stringify({ titulo: titulo.value, youtube_video_id: youtubeId.value }),
  });
  if (!res.ok) {
    erroCriar.value = (await res.json()).message ?? 'Falha ao criar a live';
    return;
  }
  const data = await res.json();
  titulo.value = '';
  youtubeId.value = '';
  lives.value.unshift(data);
}

function embedUrl(id) {
  return `${window.location.origin}/player/${id}`;
}

async function sair() {
  await supabase.auth.signOut();
  router.push('/admin/login');
}

onMounted(carregar);
</script>

<template>
  <div class="page">
    <header>
      <h1>Lives</h1>
      <div>
        <RouterLink class="link" to="/super-admin/empresas">Painel interno</RouterLink>
        <button class="link" @click="sair">Sair</button>
      </div>
    </header>

    <form class="nova" @submit.prevent="criar">
      <input v-model="titulo" placeholder="Título da live" required />
      <input v-model="youtubeId" placeholder="ID do vídeo do YouTube" required />
      <button type="submit">Criar live</button>
    </form>
    <p v-if="erroCriar" class="erro">{{ erroCriar }}</p>

    <ul class="lista">
      <li v-for="live in lives" :key="live.id">
        <div>
          <strong>{{ live.titulo }}</strong>
          <span class="status">{{ live.status }}</span>
        </div>
        <code>{{ embedUrl(live.id) }}</code>
        <RouterLink :to="`/admin/lives/${live.id}`">Gerenciar produtos →</RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page { max-width: 640px; margin: 0 auto; padding: 1.5rem; font-family: system-ui, sans-serif; }
header { display: flex; justify-content: space-between; align-items: center; }
.link { background: none; border: none; color: #666; cursor: pointer; margin-left: 1rem; text-decoration: none; font-size: 0.9rem; }
.nova { display: flex; gap: 0.5rem; margin: 1rem 0; }
.nova input { flex: 1; padding: 0.5rem; }
.erro { color: #c0392b; font-size: 0.85rem; }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.lista li { border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem; }
.status { margin-left: 0.5rem; font-size: 0.75rem; color: #888; }
code { display: block; font-size: 0.75rem; color: #888; margin: 0.25rem 0; }
</style>

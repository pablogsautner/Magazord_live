<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../../lib/supabase.js';

const router = useRouter();
const email = ref('');
const password = ref('');
const erro = ref('');
const carregando = ref(false);

async function entrar() {
  erro.value = '';
  carregando.value = true;
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });
  carregando.value = false;
  if (error) {
    erro.value = error.message;
    return;
  }
  router.push('/admin/lives');
}
</script>

<template>
  <div class="login">
    <form @submit.prevent="entrar">
      <h1>Painel da Live</h1>
      <input v-model="email" type="email" placeholder="email" required />
      <input v-model="password" type="password" placeholder="senha" required />
      <button :disabled="carregando" type="submit">Entrar</button>
      <p v-if="erro" class="erro">{{ erro }}</p>
    </form>
  </div>
</template>

<style scoped>
.login { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0b0b0d; }
form { display: flex; flex-direction: column; gap: 0.6rem; width: 280px; }
h1 { color: #fff; font-size: 1.1rem; margin-bottom: 0.5rem; }
input, button { padding: 0.6rem; border-radius: 8px; border: 1px solid #333; }
button { background: #ffcc00; font-weight: 700; cursor: pointer; border: none; }
.erro { color: #ff6161; font-size: 0.8rem; }
</style>

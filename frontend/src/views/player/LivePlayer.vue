<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { supabase } from '../../lib/supabase.js';
import YoutubeEmbed from '../../components/YoutubeEmbed.vue';
import ProductCard from '../../components/ProductCard.vue';

const props = defineProps({
  liveId: { type: String, required: true },
});

const live = ref(null);
const produtos = ref([]);
let channel = null;

const destaque = computed(() => produtos.value.find((p) => p.destaque) ?? null);
const pills = computed(() => produtos.value.filter((p) => !p.destaque));

function ordenar() {
  produtos.value.sort((a, b) => a.ordem - b.ordem);
}

async function carregar() {
  const [{ data: liveData }, { data: produtosData }] = await Promise.all([
    supabase.from('lives').select('*').eq('id', props.liveId).single(),
    supabase
      .from('live_products')
      .select('*')
      .eq('live_id', props.liveId)
      .eq('ativo', true)
      .order('ordem'),
  ]);
  live.value = liveData;
  produtos.value = produtosData ?? [];
  ordenar();
}

function aplicarEvento(payload) {
  const { eventType, new: novo, old } = payload;
  if (eventType === 'DELETE' || novo.ativo === false) {
    produtos.value = produtos.value.filter((p) => p.id !== old.id);
    return;
  }
  const idx = produtos.value.findIndex((p) => p.id === novo.id);
  if (idx >= 0) produtos.value[idx] = novo;
  else produtos.value.push(novo);
  ordenar();
}

onMounted(async () => {
  await carregar();
  channel = supabase
    .channel(`live_products:${props.liveId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_products', filter: `live_id=eq.${props.liveId}` },
      aplicarEvento
    )
    .subscribe();
});

onUnmounted(() => {
  if (channel) supabase.removeChannel(channel);
});
</script>

<template>
  <div v-if="live" class="player">
    <YoutubeEmbed :video-id="live.youtube_video_id" />
    <div class="overlay-gradient" />

    <Transition name="spotlight-pop">
      <div v-if="destaque" :key="destaque.id" class="spotlight-slot">
        <ProductCard :produto="destaque" variant="spotlight" />
      </div>
    </Transition>

    <TransitionGroup name="pill-pop" tag="div" class="pills-row">
      <ProductCard v-for="produto in pills" :key="produto.id" :produto="produto" variant="pill" />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.player {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #000;
}
.overlay-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0) 30%);
  pointer-events: none;
}

.spotlight-slot {
  position: absolute;
  right: 12px;
  bottom: 92px;
}

.pills-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16px;
  display: flex;
  gap: 8px;
  padding: 0 12px;
  overflow-x: auto;
}

/* produto em destaque entra deslizando da direita com um leve bounce */
.spotlight-pop-enter-active { transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
.spotlight-pop-leave-active { transition: all 0.25s ease-in; }
.spotlight-pop-enter-from { opacity: 0; transform: translateX(60px) scale(0.8); }
.spotlight-pop-leave-to { opacity: 0; transform: translateX(40px) scale(0.9); }

/* pills entram subindo com fade */
.pill-pop-enter-active { transition: all 0.35s ease-out; }
.pill-pop-leave-active { transition: all 0.2s ease-in; position: absolute; }
.pill-pop-enter-from { opacity: 0; transform: translateY(24px); }
.pill-pop-leave-to { opacity: 0; transform: translateY(12px); }
.pill-pop-move { transition: transform 0.3s ease; }
</style>

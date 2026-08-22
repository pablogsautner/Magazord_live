<script setup>
defineProps({
  produto: { type: Object, required: true },
  variant: { type: String, default: 'pill' }, // 'pill' (linha de baixo) | 'spotlight' (destaque grande)
});

function abrirProduto(url) {
  // Nova aba em vez de navegar a página toda: a live continua tocando na aba
  // original, e a pessoa decide se quer ir finalizar a compra (igual TikTok Shop).
  window.open(url, '_blank', 'noopener');
}

function formatarPreco(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

<template>
  <button
    class="card"
    :class="[variant, { esgotado: produto.estoque <= 0 }]"
    :disabled="produto.estoque <= 0"
    @click="abrirProduto(produto.url_produto)"
  >
    <span v-if="variant === 'spotlight'" class="tag">🔥 Oferta da live</span>
    <img :src="produto.imagem_url" :alt="produto.nome" />
    <div class="info">
      <p class="nome">{{ produto.nome }}</p>
      <p class="preco">
        <span v-if="produto.preco_antigo" class="preco-antigo">R$ {{ formatarPreco(produto.preco_antigo) }}</span>
        R$ {{ formatarPreco(produto.preco) }}
      </p>
      <p v-if="produto.estoque <= 0" class="estoque">Esgotado</p>
      <p v-else-if="produto.estoque <= 5" class="estoque baixo">Últimas {{ produto.estoque }} unidades</p>
    </div>
    <span v-if="variant === 'spotlight'" class="cta">Ver</span>
  </button>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  gap: 0.6rem;
  align-items: center;
  border: none;
  border-radius: 999px;
  background: rgba(20, 20, 24, 0.72);
  backdrop-filter: blur(6px);
  color: #fff;
  cursor: pointer;
  text-align: left;
  flex-shrink: 0;
}
.card.esgotado { opacity: 0.5; cursor: not-allowed; }

/* pill: card pequeno pra fileira horizontal no rodapé */
.card.pill {
  padding: 0.35rem 0.9rem 0.35rem 0.35rem;
  max-width: 200px;
}
.card.pill img { width: 40px; height: 40px; object-fit: cover; border-radius: 999px; }
.card.pill .nome { font-size: 0.7rem; }
.card.pill .preco { font-size: 0.8rem; }

/* spotlight: card grande que aparece sozinho quando o vendedor destaca um produto */
.card.spotlight {
  padding: 0.6rem 1rem 0.6rem 0.6rem;
  border-radius: 18px;
  box-shadow: 0 0 0 1.5px #ffcc00, 0 8px 24px rgba(0, 0, 0, 0.4);
  max-width: 280px;
}
.card.spotlight img { width: 60px; height: 60px; object-fit: cover; border-radius: 12px; }
.card.spotlight .nome { font-size: 0.8rem; }
.card.spotlight .preco { font-size: 1rem; }
.tag {
  position: absolute;
  top: -12px;
  left: 10px;
  background: #ffcc00;
  color: #111;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.cta {
  align-self: center;
  background: #ffcc00;
  color: #111;
  font-weight: 700;
  font-size: 0.75rem;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  white-space: nowrap;
}

.info { flex: 1; min-width: 0; }
.nome { margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preco { margin: 0; font-weight: 700; }
.preco-antigo { text-decoration: line-through; opacity: 0.6; font-weight: 400; margin-right: 5px; font-size: 0.7rem; }
.estoque { margin: 2px 0 0; font-size: 0.62rem; opacity: 0.85; color: #ff8a3d; }
</style>

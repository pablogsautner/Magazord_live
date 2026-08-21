import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from './lib/supabase.js';

const routes = [
  { path: '/', redirect: '/admin/lives' },
  {
    path: '/admin/login',
    component: () => import('./views/admin/Login.vue'),
  },
  {
    path: '/admin/lives',
    component: () => import('./views/admin/LivesList.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/lives/:id',
    component: () => import('./views/admin/LiveEditor.vue'),
    props: true,
    meta: { requiresAuth: true },
  },
  {
    // Painel interno (nosso, não do cliente) — o backend confere se o usuário
    // está em SUPER_ADMIN_EMAILS; aqui só exigimos estar logado.
    path: '/super-admin/empresas',
    component: () => import('./views/super-admin/Empresas.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/super-admin/empresas/:id',
    component: () => import('./views/super-admin/EmpresaDetalhe.vue'),
    props: true,
    meta: { requiresAuth: true },
  },
  {
    // Rota isolada (lazy) que vai dentro do iframe no site da Magazord.
    path: '/player/:liveId',
    component: () => import('./views/player/LivePlayer.vue'),
    props: true,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return '/admin/login';
  return true;
});

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

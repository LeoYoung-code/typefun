import { createRouter, createWebHistory } from "vue-router";

import HomeView from "../views/HomeView.vue";
import PracticeView from "../views/PracticeView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/practice/:id", name: "practice", component: PracticeView, props: true }
  ]
});

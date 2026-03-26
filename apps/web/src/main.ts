import { createApp } from "vue";

import App from "./App.vue";
import { clearPersistedProgressOnReload } from "./lib/storage";
import { router } from "./router";

import "./assets/app.css";

clearPersistedProgressOnReload();

const app = createApp(App);
app.use(router);
app.mount("#app");

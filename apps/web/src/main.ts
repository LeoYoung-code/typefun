import { createApp } from "vue";

import App from "./App.vue";
import { initDisplayHanziFontDom } from "./lib/display-hanzi-font-prefs";
import { clearPersistedProgressOnReload } from "./lib/storage";
import { router } from "./router";

import "./assets/app.css";

clearPersistedProgressOnReload();
initDisplayHanziFontDom();

const app = createApp(App);
app.use(router);
app.mount("#app");

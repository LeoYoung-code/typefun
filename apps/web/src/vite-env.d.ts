/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产环境 API 根 URL（无尾斜杠），与 `/api/...` 拼接；同域部署留空 */
  readonly VITE_API_BASE?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

/** Plain config — avoids resolving vitest from key-sounds until pnpm links deps. */
export default {
  test: {
    environment: "node",
    globals: false
  }
};

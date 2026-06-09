import { defineConfig } from "@prisma/internals";

export default defineConfig({
  sdk: {
    engine: {
      type: "library",
    },
  },
});

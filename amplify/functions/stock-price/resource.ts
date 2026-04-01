import { defineFunction } from "@aws-amplify/backend";

export const stockPriceFunction = defineFunction({
  name: "stock-price",
  entry: "./handler.ts",
  timeoutSeconds: 15,
  memoryMB: 256,
});

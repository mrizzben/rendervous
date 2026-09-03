// Self-check for price formatting (node scripts/check_prices.ts).
// Values mirror the real catalog (server/models_catalog.json) and OpenRouter's
// per-unit display (image / megapixel / per-M-tokens).
import assert from "node:assert";
import { fmtPrice } from "../src/api.ts";

const eq = assert.equal;

// unit=image (openrouter page: "$0.045 per image")
eq(fmtPrice(0.045, "image"), "$0.045/img");
eq(fmtPrice(0.03, "image"), "$0.03/img");
eq(fmtPrice(0.019, "image"), "$0.019/img");
eq(fmtPrice(0.04, "image"), "$0.04/img");
// unit=megapixel (flux: "$0.03 per megapixel")
eq(fmtPrice(0.03, "megapixel"), "$0.03/MP");
eq(fmtPrice(0.014, "megapixel"), "$0.014/MP");
// unit=token, shown per million (mai-pro "$108/M tokens", gpt-image-1 "$40/M")
eq(fmtPrice(0.000108, "token"), "$108/M tok");
eq(fmtPrice(4e-5, "token"), "$40/M tok");
eq(fmtPrice(1.5e-5, "token"), "$15/M tok");
// edge cases
eq(fmtPrice(null), "—");
eq(fmtPrice("0.03", "image"), "$0.03/img"); // string price from upstream

console.log("price self-check ok");

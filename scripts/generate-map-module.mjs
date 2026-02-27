import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const inputPath = path.join(repoRoot, "shared", "maps", "lobby.tmj");
const outputPath = path.join(repoRoot, "shared", "maps", "lobby.generated.ts");

const raw = fs.readFileSync(inputPath, "utf8");
const parsed = JSON.parse(raw);
validateMap(parsed);

const source = `// AUTO-GENERATED FILE. Do not edit by hand.\n// Source: shared/maps/lobby.tmj\n\nimport type { TiledMap } from "./types.js";\n\nexport const lobbyMap: TiledMap = ${JSON.stringify(parsed, null, 2)};\n`;

fs.writeFileSync(outputPath, source, "utf8");
console.log(`Generated ${path.relative(repoRoot, outputPath)} from ${path.relative(repoRoot, inputPath)}`);

function validateMap(map) {
  if (!map || typeof map !== "object") {
    throw new Error("Map JSON must be an object");
  }

  const requiredNumbers = ["width", "height", "tilewidth", "tileheight"];
  for (const key of requiredNumbers) {
    if (typeof map[key] !== "number") {
      throw new Error(`Map is missing numeric '${key}'`);
    }
  }

  if (!Array.isArray(map.layers)) {
    throw new Error("Map must include a layers array");
  }

  for (const layer of map.layers) {
    if (!layer || typeof layer !== "object" || typeof layer.name !== "string" || typeof layer.type !== "string") {
      throw new Error("Each layer must include name/type");
    }

    if (layer.type === "tilelayer") {
      if (!Array.isArray(layer.data)) {
        throw new Error(`Tile layer '${layer.name}' must include data[]`);
      }
      if (typeof layer.width !== "number" || typeof layer.height !== "number") {
        throw new Error(`Tile layer '${layer.name}' must include width/height`);
      }
    }

    if (layer.type === "objectgroup" && !Array.isArray(layer.objects)) {
      throw new Error(`Object layer '${layer.name}' must include objects[]`);
    }
  }
}

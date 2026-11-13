import test from "node:test";
import assert from "node:assert/strict";
import { buildAlgorithmPrompt, validateAlgorithm, modelLinks } from "../src/lib/algorithm.ts";
const spec = () => ({ name: "行人分析", cards: [{ id: "1", name: "行人检测", description: "检测行人并输出位置" }, { id: "2", name: "人员计数", description: "统计出入口人员数量" }], platforms: ["T4", "Atlas", "MC50"], repositoryTypes: ["视频仓", "图片仓"], modelLinks: "https://example.com/model.onnx\nhttps://example.com/atlas.om" });
test("multiple cards are included on every selected platform, with descriptions and model dependencies", () => {
  const value = spec();
  assert.equal(validateAlgorithm(value), null);
  const prompt = buildAlgorithmPrompt(value, [{ name: "detector.onnx", path: "D:/workspace/megvii-models/batch/0/detector.onnx", size: 16 }]);
  assert.match(prompt, /当前目录下创建一个名为「行人分析」/);
  for (const platform of value.platforms) assert.ok(prompt.includes(`${platform} 平台下包含以下算法卡片：「行人检测」、「人员计数」`));
  for (const card of value.cards) assert.ok(prompt.includes(`名为「${card.name}」的算法卡片的工作功能是：${card.description}`));
  assert.ok(prompt.includes("视频仓、图片仓"));
  assert.ok(prompt.includes("D:/workspace/megvii-models/batch/0/detector.onnx"));
  assert.ok(prompt.includes("https://example.com/atlas.om"));
});
test("missing required fields, duplicate card names, and invalid download links are rejected", () => {
  for (const patch of [{ name: " " }, { name: "../escape" }, { cards: [] }, { cards: [{ id: "1", name: "a", description: "" }] }, { platforms: [] }, { repositoryTypes: [] }, { modelLinks: "file:///C:/model" }, { modelLinks: "not a link" }, { cards: [{ id: "1", name: "A", description: "x" }, { id: "2", name: " a ", description: "y" }] }]) assert.ok(validateAlgorithm({ ...spec(), ...patch }), JSON.stringify(patch));
});
test("models are optional and duplicate links are omitted", () => {
  const value = { ...spec(), modelLinks: "" };
  assert.equal(validateAlgorithm(value), null);
  assert.match(buildAlgorithmPrompt(value, []), /未提供模型文件或下载链接/);
  assert.deepEqual(modelLinks(" https://example.com/a\r\nhttps://example.com/a\n\nhttps://example.com/b "), ["https://example.com/a", "https://example.com/b"]);
});

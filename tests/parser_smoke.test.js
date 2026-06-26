const assert = require("assert");
const { parseQuestionText } = require("../app.js");

function firstQuestion(text) {
  const questions = parseQuestionText(text, "smoke");
  assert.strictEqual(questions.length, 1, "expected exactly one parsed question");
  return questions[0];
}

const leakedHalfWidth = firstQuestion(
  "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有(A)A. 较高的相似度B. 较低的相似度C. 相同的特征D. 不同的特征答案：A"
);
assert.strictEqual(leakedHalfWidth.stem, "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有（ ）");
assert.deepStrictEqual(leakedHalfWidth.options.map((item) => item.key), ["A", "B", "C", "D"]);
assert.deepStrictEqual(leakedHalfWidth.options.map((item) => item.text), [
  "较高的相似度",
  "较低的相似度",
  "相同的特征",
  "不同的特征"
]);

const leakedFullWidth = firstQuestion(
  "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有（A）A. 较高的相似度B. 较低的相似度C. 相同的特征D. 不同的特征答案：A"
);
assert.strictEqual(leakedFullWidth.stem, "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有（ ）");
assert.deepStrictEqual(leakedFullWidth.options.map((item) => item.key), ["A", "B", "C", "D"]);

const normalBlank = firstQuestion(
  "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有（ ）A. 较高的相似度B. 较低的相似度C. 相同的特征D. 不同的特征答案：A"
);
assert.strictEqual(normalBlank.stem, "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有（ ）");
assert.deepStrictEqual(normalBlank.options.map((item) => item.key), ["A", "B", "C", "D"]);

const positionalLeak = firstQuestion(
  "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有(B)A. 较高的相似度B. 较低的相似度C. 相同的特征D. 不同的特征答案：A"
);
assert.strictEqual(positionalLeak.stem, "聚类分析是将数据集合划分为多个类别的过程，聚类后同一类别中数据样本具有（ ）");

const realStemNotation = firstQuestion(
  "1. 这里的记号(A)只是题干内容，不是选项。真正空为（ ）A. 是B. 否C. 可能D. 不知道答案：A"
);
assert.strictEqual(realStemNotation.stem, "这里的记号(A)只是题干内容，不是选项。真正空为（ ）");
assert.deepStrictEqual(realStemNotation.options.map((item) => item.key), ["A", "B", "C", "D"]);

console.log("parser smoke ok");

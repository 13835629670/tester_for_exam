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

const formulaImageOptions = firstQuestion(
  "5、n个变量可构成的最小项的个数为：（ ）A、n B、2n C、[[IMG:19x20:data:image/png;base64,AAAA]] D、[[IMG:41x20:data:image/png;base64,BBBB]]答案：C"
);
assert.strictEqual(formulaImageOptions.stem, "n个变量可构成的最小项的个数为：（ ）");
assert.deepStrictEqual(formulaImageOptions.options.map((item) => item.key), ["A", "B", "C", "D"]);
assert.strictEqual(formulaImageOptions.options[2].text, "[[IMG:19x20:data:image/png;base64,AAAA]]");
assert.strictEqual(formulaImageOptions.options[3].text, "[[IMG:41x20:data:image/png;base64,BBBB]]");

const pollutedFormulaImageOptions = firstQuestion(
  "5、n个变量可构成的最小项的个数为：（ ）A、n B、2n C、[[IMG. 19x20:data:image/png;base64,AAAA]] D、[[IMG. 41x20:data:image/png;base64,BBBB]]答案：C"
);
assert.deepStrictEqual(pollutedFormulaImageOptions.options.map((item) => item.key), ["A", "B", "C", "D"]);
assert.strictEqual(pollutedFormulaImageOptions.options[2].text, "[[IMG:19x20:data:image/png;base64,AAAA]]");
assert.strictEqual(pollutedFormulaImageOptions.options[3].text, "[[IMG:41x20:data:image/png;base64,BBBB]]");

const prefixedOptions = firstQuestion(
  "知识点：1 难易度：容易认知度：识记\nMCS-51单片机CPU的主要组成部分为( )\n选项A）运算器、控制器\n选项B）加法器、寄存器\n选项C）运算器、加法器\n选项D）运算器、译码器\n答案：A"
);
assert.strictEqual(prefixedOptions.stem, "MCS-51单片机CPU的主要组成部分为（ ）");
assert.deepStrictEqual(prefixedOptions.options.map((item) => item.key), ["A", "B", "C", "D"]);
assert.deepStrictEqual(prefixedOptions.options.map((item) => item.text), [
  "运算器、控制器",
  "加法器、寄存器",
  "运算器、加法器",
  "运算器、译码器"
]);

const largeImageToken = `[[IMG:907x500:data:image/jpeg;base64,${"A".repeat(130000)}]]`;
const largeImageQuestion = firstQuestion(
  `如下图所示，为51系列单片机的并行口的哪一类( )\n${largeImageToken}\n选项A）P0\n选项B）P1\n选项C）P2\n选项D）P3\n答案：A`
);
assert.strictEqual(largeImageQuestion.stem.includes("[[IMG:907x500:data:image/jpeg;base64,"), true);
assert.deepStrictEqual(largeImageQuestion.options.map((item) => item.key), ["A", "B", "C", "D"]);

console.log("parser smoke ok");

const assert = require("assert");
const { parseQuestionText, createMcuExam, scoreMcuExam } = require("../app.js");

const parsed = parseQuestionText(
  "知识点：5 难度：易\n5. MCS-51 单片机片内 RAM 低 128B 的地址范围是（ ）。\nA. 00H-7FH\nB. 80H-FFH\n答案：A",
  "2022上-单片机单项选择题.docx"
);
assert.strictEqual(parsed.length, 1);
assert.strictEqual(parsed[0].type, "single");
assert.strictEqual(parsed[0].knowledgePoint, 5);

const questions = [];
const singlePoints = [
  ...range(1, 12),
  ...range(19, 27),
  ...range(28, 40),
  ...range(54, 56)
];
singlePoints.forEach((point, index) => {
  questions.push(choiceQuestion(`s${index}`, "single", point, "A"));
});

range(2, 40).forEach((point, index) => {
  questions.push(choiceQuestion(`j${index}`, "judge", point, "正确"));
});

const exam = createMcuExam(questions);
assert.strictEqual(exam.title, "单片机模拟考试");
assert.strictEqual(exam.total, 70);
assert(exam.summary.includes("单片机固定策略"));
assert.strictEqual(exam.items.filter((item) => item.type === "single").length, 36);
assert.strictEqual(exam.items.filter((item) => item.type === "judge").length, 16);
assert.deepStrictEqual(exam.warnings, []);

const choiceMiddlePoints = exam.items
  .filter((item) => item.type === "single" && item.question.knowledgePoint >= 19 && item.question.knowledgePoint <= 27)
  .map((item) => item.question.knowledgePoint);
assert.strictEqual(choiceMiddlePoints.length, 8);
assert.strictEqual(new Set(choiceMiddlePoints).size, 8);

const oneMissingMiddleExam = createMcuExam(
  questions.filter((question) => !(question.type === "single" && question.knowledgePoint === 22))
);
assert.strictEqual(oneMissingMiddleExam.items.filter((item) => item.type === "single").length, 36);
assert.deepStrictEqual(oneMissingMiddleExam.warnings, []);

exam.items.forEach((item) => {
  exam.answers[item.id] = item.question.answer;
});
assert.deepStrictEqual(scoreMcuExam(exam), {
  score: 70,
  total: 70,
  correctCount: 52,
  questionCount: 52
});

const missingKnowledgeExam = createMcuExam(
  questions.filter((question) => !(question.type === "single" && question.knowledgePoint >= 54))
);
assert.strictEqual(missingKnowledgeExam.items.filter((item) => item.type === "single").length, 33);
assert(missingKnowledgeExam.warnings.some((text) => text.includes("选择题题库不足")));

function choiceQuestion(id, type, point, answer) {
  return {
    id,
    type,
    stem: `${type} ${point}`,
    options: type === "judge"
      ? [{ key: "正确", text: "正确" }, { key: "错误", text: "错误" }]
      : ["A", "B", "C", "D"].map((key) => ({ key, text: key })),
    answer,
    knowledgePoint: point
  };
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

console.log("mcu exam smoke ok");

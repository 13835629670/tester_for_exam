const assert = require("assert");
const {
  parseQuestionText,
  createGenericExam,
  scoreMcuExam,
  assertReadableText,
  evaluateMultiAnswer,
  questionScopeParts
} = require("../app.js");

const text = [
  "导论",
  "一、单选题",
  "1. 马克思主义有（ C ）个基本组成部分。",
  "A. 一",
  "B. 二",
  "C. 三",
  "D. 四",
  "二、多选题",
  "1. 马克思主义理论体系的三个主要组成部分是（BCD）。",
  "A. 马克思主义政治学",
  "B. 马克思主义政治经济学",
  "C. 科学社会主义",
  "D. 马克思主义哲学",
  "三、判断题",
  "1. 马克思主义政治经济学是对英国古典政治经济学的继承和发展。（√）",
  "第一章",
  "一、填空题",
  "1. 哲学基本问题是________和存在的关系问题。",
  "答案：思维",
  "二、简答题",
  "1. 简述实践在认识中的作用。",
  "参考答案: 实践是认识的来源、动力、目的和检验标准。"
].join("\n");

const questions = parseQuestionText(text, "马克思主义基本原理.docx");
assert.deepStrictEqual(questions.map((question) => question.type), ["single", "multi", "judge", "blank", "short"]);
assert.strictEqual(questions[0].answer, "C");
assert.strictEqual(questions[0].stem, "马克思主义有（ ）个基本组成部分。");
assert.strictEqual(questions[0].chapter, "导论");
assert.deepStrictEqual(questionScopeParts(questions[0]), [
  "章节 导论",
  "原题 1",
  "文件 马克思主义基本原理.docx"
]);
assert.strictEqual(questions[1].answer, "BCD");
assert.strictEqual(questions[1].stem, "马克思主义理论体系的三个主要组成部分是（ ）。");
assert.strictEqual(questions[1].chapter, "导论");
assert.strictEqual(questions[2].answer, "正确");
assert.strictEqual(questions[2].chapter, "导论");
assert.strictEqual(questions[3].answer, "思维");
assert.strictEqual(questions[3].chapter, "第一章");
assert.strictEqual(questions[4].answer, "实践是认识的来源、动力、目的和检验标准。");
assert(!questions[4].stem.endsWith("参考"));

const correctAnswerLabelQuestions = parseQuestionText(
  [
    "一、简答题",
    "1. 简述劳动二重性。",
    "正确答案：具体劳动和抽象劳动。"
  ].join("\n"),
  "简答题.docx"
);
assert.strictEqual(correctAnswerLabelQuestions.length, 1);
assert.strictEqual(correctAnswerLabelQuestions[0].answer, "具体劳动和抽象劳动。");
assert(!correctAnswerLabelQuestions[0].stem.endsWith("正确"));

const exam = createGenericExam(questions, { single: 1, multi: 1, judge: 1, blank: 1, short: 1 });
assert.deepStrictEqual(exam.items.map((item) => item.type), ["single", "multi", "judge", "blank", "short"]);
assert.strictEqual(exam.total, 3);
exam.items.forEach((item) => {
  if (item.points) exam.answers[item.id] = item.question.answer;
});
assert.deepStrictEqual(scoreMcuExam(exam), {
  score: 3,
  total: 3,
  correctCount: 3,
  questionCount: 5
});

assert.deepStrictEqual(evaluateMultiAnswer("BCD", "BCD"), {
  status: "correct",
  selected: "BCD",
  correct: "BCD",
  wrong: "",
  missed: "",
  pickedCorrect: "BCD"
});
assert.deepStrictEqual(evaluateMultiAnswer("C", "ABC"), {
  status: "partial",
  selected: "C",
  correct: "ABC",
  wrong: "",
  missed: "AB",
  pickedCorrect: "C"
});
assert.deepStrictEqual(evaluateMultiAnswer("CD", "ABC"), {
  status: "wrong",
  selected: "CD",
  correct: "ABC",
  wrong: "D",
  missed: "AB",
  pickedCorrect: "C"
});
assert.strictEqual(scoreMcuExam({
  total: 1,
  items: [{
    id: "m1",
    points: 1,
    question: { type: "multi", answer: "ABC" }
  }],
  answers: { m1: "C" }
}).score, 0);

assert.doesNotThrow(() => assertReadableText(text, "马克思主义基本原理.docx"));
assert.doesNotThrow(() => assertReadableText("Office_ Office_ Office_ 正确答案: 可以识别。", "reference-answer.docx"));
assert.throws(
  () => assertReadableText("\u35d7\u2de8\u1b13\u228f\u01c9\u071f\u15f1\u040f\u041d\u0dce ".repeat(200), "bad.pdf"),
  /乱码/
);

const pdfLikeText = [
  "2011 考研政治《马克思主义基本原理概论》试卷 1",
  "1、思维与存在的关系问题是（C ）",
  "A.唯心主义哲学的基本问题 B.唯物主义哲学的基本问题",
  "C.全部哲学的基本问题 D.一部分哲学的基本问题",
  "2、物质的本质特性是（A ）",
  "A.客观实在性 B.实物性 C.结构性 D.可分性",
  "一、单选题",
  "1. 哲学是(A)",
  "A. 科学的世界观和方法论 B. 科学性和革命性相统一的世界观",
  "C. 理论化和系统化的世界观 D. 辩证唯物主义和历史唯物主义"
].join("\n");

const pdfLikeQuestions = parseQuestionText(pdfLikeText, "mayuan.pdf");
assert.strictEqual(pdfLikeQuestions.length, 3);
assert.deepStrictEqual(pdfLikeQuestions.map((question) => question.answer), ["C", "A", "A"]);
assert.strictEqual(pdfLikeQuestions[0].options.length, 4);
assert.strictEqual(pdfLikeQuestions[0].chapter, "2011 考研政治《马克思主义基本原理概论》试卷 1");
assert.strictEqual(pdfLikeQuestions[1].chapter, "2011 考研政治《马克思主义基本原理概论》试卷 1");
assert.strictEqual(pdfLikeQuestions[0].originNumber, 1);

const pdfPageNumberText = [
  "《马克思主义基本原理概论》试题 17",
  "59",
  "一、单项选择题（本大题共 40 小题，每小题 1 分，共 40 分）",
  "1、唯心主义的两种基本形式是（B ）",
  "A、形而上学唯心主义和辩证唯心主义 B、主观唯心主义和客观唯心主义",
  "C、彻底的唯心主义和不彻底的唯心主义 D、自然观上的唯心主义和历史观上的唯心主义"
].join("\n");

const pageNumberQuestions = parseQuestionText(pdfPageNumberText, "mayuan.pdf");
assert.strictEqual(pageNumberQuestions.length, 1);
assert.strictEqual(pageNumberQuestions[0].chapter, "《马克思主义基本原理概论》试题 17");
assert.strictEqual(pageNumberQuestions[0].originNumber, 1);

const codeBlankText = [
  "一、填空题",
  "知识点：35难易度：容易认知度：识记",
  "补充下面程序的头文件。",
  "#include <reg51.h>",
  "#include <________>//填空",
  "void main()",
  "{",
  "SCON=0x52;",
  "}",
  "答案：stdio.h",
  "知识点：33难易度：容易认知度：识记",
  "设振荡频率为11.0592MHz,则T1初值应该为：TH1=TL1=0x________。",
  "答案：FA"
].join("\n");

const codeBlankQuestions = parseQuestionText(codeBlankText, "单片机填空题.docx");
assert.deepStrictEqual(codeBlankQuestions.map((question) => question.type), ["blank", "blank"]);
assert.strictEqual(codeBlankQuestions[0].answer, "stdio.h");
assert(codeBlankQuestions[0].stem.includes("#include <reg51.h>\n#include <________>//填空\nvoid main()"));
assert.strictEqual(codeBlankQuestions[1].answer, "FA");

console.log("generic exam smoke ok");

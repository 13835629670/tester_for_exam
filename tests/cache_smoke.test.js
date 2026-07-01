const assert = require("assert");
const { hydrateState } = require("../app.js");

const restored = hydrateState({
  subjects: [
    {
      id: "subject-1",
      name: "数电",
      questions: [{ id: "q1", type: "single", stem: "题干", options: [], answer: "A" }],
      imports: [{ id: "import-1", fileName: "题库.doc", count: 1 }],
      wrongIds: ["q1"],
      answered: [["q1", "B"]],
      practiceProgress: { all: 3, single: 2, judge: 1 }
    }
  ],
  activeSubjectId: "subject-1",
  activeView: "practice",
  practiceMode: "single",
  practiceOrder: ["q1"],
  practiceIndex: 2,
  previewFilter: "all"
});

assert.strictEqual(restored.subjects.length, 1);
assert(restored.subjects[0].wrongIds instanceof Set);
assert(restored.subjects[0].answered instanceof Map);
assert.strictEqual(restored.subjects[0].wrongIds.has("q1"), true);
assert.strictEqual(restored.subjects[0].answered.get("q1"), "B");
assert.deepStrictEqual(restored.subjects[0].practiceProgress, { all: 3, single: 2, multi: 0, judge: 1, blank: 0, short: 0 });

const fallback = hydrateState({
  subjects: [{ id: "subject-1", name: "数电" }],
  activeSubjectId: "missing",
  activeView: "unknown",
  practiceMode: "unknown",
  previewFilter: "unknown"
});

assert.strictEqual(fallback.activeSubjectId, "subject-1");
assert.strictEqual(fallback.activeView, "practice");
assert.strictEqual(fallback.practiceMode, "all");
assert.strictEqual(fallback.previewFilter, "all");
assert.deepStrictEqual(fallback.subjects[0].practiceProgress, { all: 0, single: 0, multi: 0, judge: 0, blank: 0, short: 0 });

const legacyPdfQuestions = [];
for (let paper = 1; paper <= 8; paper += 1) {
  legacyPdfQuestions.push({
    id: `p${paper}-s1`,
    type: "single",
    sourceName: "马原21套题有答案版(1) (1)(4).pdf",
    raw: "1.单选题干（A）\nA. 甲 B. 乙"
  });
  legacyPdfQuestions.push({
    id: `p${paper}-s40`,
    type: "single",
    sourceName: "马原21套题有答案版(1) (1)(4).pdf",
    raw: "40.单选题干（A）\nA. 甲 B. 乙"
  });
  legacyPdfQuestions.push({
    id: `p${paper}-m7`,
    type: "multi",
    sourceName: "马原21套题有答案版(1) (1)(4).pdf",
    raw: "7.多选题干（ABC）\nA. 甲 B. 乙 C. 丙 D. 丁"
  });
  legacyPdfQuestions.push({
    id: `p${paper}-m10`,
    type: "multi",
    sourceName: "马原21套题有答案版(1) (1)(4).pdf",
    raw: "10.多选题干（ABC）\nA. 甲 B. 乙 C. 丙 D. 丁"
  });
}

const migrated = hydrateState({
  subjects: [{
    id: "subject-pdf",
    name: "马原",
    questions: legacyPdfQuestions
  }],
  activeSubjectId: "subject-pdf"
});
const legacyMulti77 = migrated.subjects[0].questions.find((question) => question.id === "p8-m7");
assert.strictEqual(legacyMulti77.chapter, "第 8 套（推断）");
assert.strictEqual(legacyMulti77.originNumber, 7);

console.log("cache smoke ok");

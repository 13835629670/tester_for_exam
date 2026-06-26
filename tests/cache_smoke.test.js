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
assert.deepStrictEqual(restored.subjects[0].practiceProgress, { all: 3, single: 2, judge: 1 });

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
assert.deepStrictEqual(fallback.subjects[0].practiceProgress, { all: 0, single: 0, judge: 0 });

console.log("cache smoke ok");

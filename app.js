(function () {
  const hasDom = typeof document !== "undefined";
  const CACHE_KEY = "quiz-state";
  const EXAM_STRATEGY = {
    title: "单片机模拟考试",
    total: 70,
    sections: [
      {
        type: "single",
        label: "选择题",
        count: 36,
        points: 1.5,
        selectors: [
          ...rangePoints(1, 12),
          { points: pointRange(19, 27), count: 8, distinctPoints: true },
          ...rangePoints(28, 40),
          ...rangePoints(54, 56)
        ]
      },
      {
        type: "judge",
        label: "判断题",
        count: 16,
        points: 1,
        selectors: [
          rangeGroup(2, 4),
          rangeGroup(5, 8),
          rangeGroup(9, 12),
          rangeGroup(19, 20),
          rangeGroup(21, 22),
          rangeGroup(23, 24),
          rangeGroup(25, 27),
          rangeGroup(29, 32),
          ...rangePoints(33, 40)
        ]
      }
    ]
  };
  const cacheStore = {
    dbName: "QuizMemoryTool",
    storeName: "state",
    async open() {
      if (!hasDom || typeof indexedDB === "undefined") return null;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(this.storeName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async save(value) {
      const db = await this.open();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).put(value, CACHE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async load() {
      const db = await this.open();
      if (!db) return null;
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const request = tx.objectStore(this.storeName).get(CACHE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    }
  };

  let cacheReady = false;
  let saveTimer = null;
  const state = {
    subjects: [],
    activeSubjectId: null,
    activeView: "practice",
    practiceMode: "all",
    practiceOrder: [],
    practiceIndex: 0,
    previewFilter: "all",
    exam: createEmptyExam()
  };

  const els = hasDom ? {
    subjectInput: document.getElementById("subjectInput"),
    addSubjectBtn: document.getElementById("addSubjectBtn"),
    subjectList: document.getElementById("subjectList"),
    subjectCount: document.getElementById("subjectCount"),
    fileInput: document.getElementById("fileInput"),
    importLog: document.getElementById("importLog"),
    importedCount: document.getElementById("importedCount"),
    importedList: document.getElementById("importedList"),
    serverHint: document.getElementById("serverHint"),
    activeSubjectName: document.getElementById("activeSubjectName"),
    stats: document.getElementById("stats"),
    emptyState: document.getElementById("emptyState"),
    tabs: document.querySelectorAll(".tab"),
    views: document.querySelectorAll(".view"),
    practiceArea: document.getElementById("practiceArea"),
    wrongArea: document.getElementById("wrongArea"),
    previewArea: document.getElementById("previewArea"),
    examArea: document.getElementById("examArea"),
    examSummary: document.getElementById("examSummary"),
    generateExamBtn: document.getElementById("generateExamBtn"),
    submitExamBtn: document.getElementById("submitExamBtn"),
    generateGenericExamBtn: document.getElementById("generateGenericExamBtn"),
    genericSingleCount: document.getElementById("genericSingleCount"),
    genericMultiCount: document.getElementById("genericMultiCount"),
    genericJudgeCount: document.getElementById("genericJudgeCount"),
    genericBlankCount: document.getElementById("genericBlankCount"),
    genericShortCount: document.getElementById("genericShortCount"),
    jumpInput: document.getElementById("jumpInput"),
    jumpBtn: document.getElementById("jumpBtn"),
    clearProgressBtn: document.getElementById("clearProgressBtn"),
    shufflePracticeBtn: document.getElementById("shufflePracticeBtn"),
    resetPracticeBtn: document.getElementById("resetPracticeBtn"),
    clearWrongBtn: document.getElementById("clearWrongBtn"),
    exportCacheBtn: document.getElementById("exportCacheBtn"),
    importCacheBtn: document.getElementById("importCacheBtn"),
    importCacheInput: document.getElementById("importCacheInput")
  } : {};

  const typeLabels = {
    single: "单选",
    multi: "多选",
    judge: "判断",
    blank: "填空",
    short: "简答"
  };

  function rangePoints(start, end) {
    return pointRange(start, end).map((point) => ({
      points: [point],
      count: 1
    }));
  }

  function rangeGroup(start, end) {
    return {
      points: pointRange(start, end),
      count: 1
    };
  }

  function pointRange(start, end) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  function createEmptyExam() {
    return {
      items: [],
      answers: {},
      submitted: false,
      result: null,
      warnings: [],
      title: "",
      summary: "",
      total: 0
    };
  }

  if (hasDom) init();

  async function init() {
    bindEvents();
    renderServerHint();
    try {
      const saved = await cacheStore.load();
      if (saved) {
        applySerializedState(saved);
      }
    } catch (error) {
      console.warn("读取缓存失败：", error);
      logImport("本地缓存读取失败，可重新导入题库。", "warn");
    }
    if (!state.subjects.length) {
      createSubject("默认科目");
    } else {
      resetPractice(false);
    }
    cacheReady = true;
    render();
  }

  function renderServerHint() {
    if (!els.serverHint) return;
    if (window.location.protocol === "file:") {
      els.serverHint.textContent = "当前是直接打开页面：doc/pdf 文件无法可靠读取，请用 python server.py 启动后导入。";
      els.serverHint.classList.add("warn");
    } else {
      els.serverHint.textContent = "当前已通过本地服务打开：doc/docx/pdf 均可导入。";
      els.serverHint.classList.remove("warn");
    }
  }

  function bindEvents() {
    if (els.exportCacheBtn) {
      els.exportCacheBtn.addEventListener("click", exportCacheFile);
    }

    if (els.importCacheBtn && els.importCacheInput) {
      els.importCacheBtn.addEventListener("click", () => els.importCacheInput.click());
      els.importCacheInput.addEventListener("change", importCacheFile);
    }

    if (els.generateExamBtn) {
      els.generateExamBtn.addEventListener("click", () => {
        const subject = getActiveSubject();
        if (!subject || !subject.questions.length) {
          logImport("请先导入单片机题库。", "warn");
          return;
        }
        state.exam = createMcuExam(subject.questions);
        state.activeView = "exam";
        render();
      });
    }

    if (els.submitExamBtn) {
      els.submitExamBtn.addEventListener("click", () => {
        if (!state.exam.items.length) {
          logImport("请先生成试卷。", "warn");
          return;
        }
        submitMcuExam();
      });
    }

    if (els.generateGenericExamBtn) {
      els.generateGenericExamBtn.addEventListener("click", () => {
        const subject = getActiveSubject();
        if (!subject || !subject.questions.length) {
          logImport("请先导入题库。", "warn");
          return;
        }
        const counts = countTypes(subject.questions);
        state.exam = createGenericExam(subject.questions, {
          single: readExamCount(els.genericSingleCount, counts.single),
          multi: readExamCount(els.genericMultiCount, counts.multi),
          judge: readExamCount(els.genericJudgeCount, counts.judge),
          blank: readExamCount(els.genericBlankCount, counts.blank),
          short: readExamCount(els.genericShortCount, counts.short)
        });
        state.activeView = "exam";
        render();
      });
    }

    els.addSubjectBtn.addEventListener("click", () => {
      const name = els.subjectInput.value.trim();
      if (!name) {
        logImport("请输入科目名称。", "warn");
        return;
      }
      createSubject(name);
      els.subjectInput.value = "";
      render();
    });

    els.subjectInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") els.addSubjectBtn.click();
    });

    els.fileInput.addEventListener("change", handleFiles);

    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.activeView = tab.dataset.view;
        render();
      });
    });

    document.querySelectorAll("[data-practice-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.practiceMode = button.dataset.practiceMode;
        resetPractice(false);
        render();
      });
    });

    document.querySelectorAll("[data-preview-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.previewFilter = button.dataset.previewFilter;
        document.querySelectorAll("[data-preview-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderPreview();
      });
    });

    els.shufflePracticeBtn.addEventListener("click", () => {
      resetPractice(true);
      renderPractice();
    });

    els.resetPracticeBtn.addEventListener("click", () => {
      resetPractice(false);
      renderPractice();
    });

    if (els.jumpBtn && els.jumpInput) {
      els.jumpBtn.addEventListener("click", () => {
        const value = Number.parseInt(els.jumpInput.value, 10);
        if (!Number.isInteger(value) || value < 1 || value > state.practiceOrder.length) {
          logImport(`请输入 1 到 ${state.practiceOrder.length || 1} 之间的题号。`, "warn");
          els.jumpInput.value = "";
          return;
        }
        updatePracticeIndex(value - 1);
        els.jumpInput.value = "";
        renderPractice();
      });
      els.jumpInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") els.jumpBtn.click();
      });
    }

    if (els.clearProgressBtn) {
      els.clearProgressBtn.addEventListener("click", () => {
        const subject = getActiveSubject();
        if (!subject) return;
        subject.practiceProgress = createPracticeProgress();
        updatePracticeIndex(0);
        renderPractice();
      });
    }

    els.clearWrongBtn.addEventListener("click", () => {
      const subject = getActiveSubject();
      if (!subject) return;
      subject.wrongIds.clear();
      render();
    });
  }

  function readExamCount(input, fallback) {
    if (!input || input.value === "") return Math.max(0, Number(fallback) || 0);
    const value = Number(input.value);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  function createSubject(name) {
    const subject = {
      id: createId(),
      name,
      questions: [],
      imports: [],
      wrongIds: new Set(),
      answered: new Map(),
      practiceProgress: createPracticeProgress()
    };
    state.subjects.push(subject);
    state.activeSubjectId = subject.id;
    resetPractice(false);
  }

  function createPracticeProgress() {
    return { all: 0, single: 0, multi: 0, judge: 0, blank: 0, short: 0 };
  }

  function createId() {
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  function getActiveSubject() {
    return state.subjects.find((subject) => subject.id === state.activeSubjectId) || null;
  }

  function scheduleSave() {
    if (!cacheReady) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      cacheStore.save(serializeState())
        .catch((error) => {
          console.warn("保存缓存失败：", error);
          logImport("本地缓存保存失败，可使用导出缓存手动备份。", "warn");
        });
    }, 300);
  }

  function serializeState() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      subjects: state.subjects.map((subject) => ({
        ...subject,
        wrongIds: Array.from(subject.wrongIds || []),
        answered: Array.from((subject.answered || new Map()).entries()),
        practiceProgress: normalizePracticeProgress(subject.practiceProgress)
      })),
      activeSubjectId: state.activeSubjectId,
      activeView: state.activeView,
      practiceMode: state.practiceMode,
      practiceOrder: Array.isArray(state.practiceOrder) ? state.practiceOrder : [],
      practiceIndex: state.practiceIndex,
      previewFilter: state.previewFilter
    };
  }

  function applySerializedState(value) {
    const next = hydrateState(value);
    Object.assign(state, next);
  }

  function hydrateState(value) {
    if (!value || !Array.isArray(value.subjects)) {
      throw new Error("缓存文件格式不正确。");
    }
    const subjects = value.subjects.map((subject) => ({
      id: String(subject.id || createId()),
      name: String(subject.name || "未命名科目"),
      questions: normalizeCachedQuestions(subject.questions),
      imports: Array.isArray(subject.imports) ? subject.imports : [],
      wrongIds: new Set(Array.isArray(subject.wrongIds) ? subject.wrongIds : []),
      answered: new Map(normalizeEntries(subject.answered)),
      practiceProgress: normalizePracticeProgress(subject.practiceProgress)
    }));
    const activeSubjectId = subjects.some((subject) => subject.id === value.activeSubjectId)
      ? value.activeSubjectId
      : (subjects[0] ? subjects[0].id : null);
    return {
      subjects,
      activeSubjectId,
      activeView: ["practice", "wrong", "preview", "exam"].includes(value.activeView) ? value.activeView : "practice",
      practiceMode: ["all", "single", "multi", "judge", "blank", "short"].includes(value.practiceMode) ? value.practiceMode : "all",
      practiceOrder: Array.isArray(value.practiceOrder) ? value.practiceOrder : [],
      practiceIndex: Number.isInteger(value.practiceIndex) && value.practiceIndex >= 0 ? value.practiceIndex : 0,
      previewFilter: ["all", "single", "multi", "judge", "blank", "short"].includes(value.previewFilter) ? value.previewFilter : "all"
    };
  }

  function normalizeCachedQuestions(value) {
    if (!Array.isArray(value)) return [];
    const questions = value.map((question) => ({
      ...question,
      chapter: normalizeQuestionContext(question.chapter || ""),
      knowledgePoint: question.knowledgePoint ?? extractKnowledgePoint(question.raw || ""),
      originNumber: question.originNumber ?? extractOriginalQuestionNumber(question.raw || "")
    }));
    return inferMissingQuestionContexts(questions);
  }

  function normalizePracticeProgress(value) {
    const progress = createPracticeProgress();
    if (!value || typeof value !== "object") return progress;
    for (const key of Object.keys(progress)) {
      const index = Number(value[key]);
      progress[key] = Number.isInteger(index) && index >= 0 ? index : 0;
    }
    return progress;
  }

  function normalizeEntries(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => Array.isArray(entry) && entry.length >= 2);
  }

  function exportCacheFile() {
    const blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quiz-cache-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    logImport("缓存已导出。", "ok");
  }

  function importCacheFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        applySerializedState(parsed);
        cacheReady = true;
        await cacheStore.save(serializeState());
        resetPractice(false);
        render();
        logImport(`${file.name} 导入成功。`, "ok");
      } catch (error) {
        logImport(`缓存导入失败：${error.message}`, "error");
      }
    };
    reader.onerror = () => logImport("缓存文件读取失败。", "error");
    reader.readAsText(file);
  }

  async function handleFiles(event) {
    const subject = getActiveSubject();
    const files = Array.from(event.target.files || []);
    if (!subject) {
      logImport("请先创建并选择科目。", "warn");
      event.target.value = "";
      return;
    }

    for (const file of files) {
      const ext = getExt(file.name);
      if (!["docx", "doc", "pdf"].includes(ext)) {
        logImport(`${file.name} 已跳过：仅支持 docx、doc 和 pdf。`, "warn");
        continue;
      }

      try {
        logImport(`正在读取：${file.name}`, "warn");
        const importId = createId();
        const text = await readFileText(file);
        const questions = parseQuestionText(text, file.name).map((question) => ({
          ...question,
          importId
        }));

        if (!questions.length) {
          logImport(`${file.name} 未识别到题目。`, "warn");
          continue;
        }

        subject.questions.push(...questions);
        subject.imports.push({
          id: importId,
          fileName: file.name,
          count: questions.length,
          importedAt: new Date()
        });
        logImport(`${file.name} 导入 ${questions.length} 题。`, "ok");
      } catch (error) {
        logImport(`${file.name} 读取失败：${error.message}`, "error");
      }
    }

    event.target.value = "";
    resetPractice(false);
    render();
  }

  function getExt(fileName) {
    return String(fileName).split(".").pop().toLowerCase();
  }

  async function readFileText(file) {
    const serverText = await tryServerExtractText(file);
    if (serverText) {
      assertReadableText(serverText, file.name);
      return serverText;
    }

    const ext = getExt(file.name);
    if (ext === "docx") {
      if (!window.mammoth) {
        throw new Error("docx 解析库未加载，请检查网络。");
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      const text = result.value || "";
      assertReadableText(text, file.name);
      return text;
    }

    if (ext === "doc") {
      throw new Error("doc 文件需要通过 python server.py 启动后，从 http://127.0.0.1:5175 打开页面再导入。");
    }

    if (ext === "pdf") {
      throw new Error("pdf 文件需要通过 python server.py 启动后导入；若提示缺少 PyMuPDF，请先执行 python -m pip install PyMuPDF。");
    }

    throw new Error("仅支持 docx、doc 和 pdf。");
  }

  async function tryServerExtractText(file) {
    if (!/^https?:/.test(window.location.protocol)) return "";
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      const response = await fetch("/api/extract-text", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok && payload && payload.error) {
        throw new Error(payload.error);
      }
      if (payload && payload.ok && payload.text) {
        logImport(`已使用本地解析服务读取：${file.name}`, "ok");
        if (payload.warning) logImport(payload.warning, "warn");
        return payload.text;
      }
    } catch (error) {
      if (getExt(file.name) === "pdf") throw error;
      return "";
    }
    return "";
  }

  function assertReadableText(text, fileName) {
    const sample = String(text || "").slice(0, 4000);
    const visibleSample = String(text || "")
      .replace(/\[\[(?:IMG|TABLE):[\s\S]*?\]\]/g, "[media]")
      .slice(0, 8000);
    const badChars = (sample.match(/[�\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
    const cjkChars = (visibleSample.match(/[\u4e00-\u9fa5]/g) || []).length;
    const answerMarks = (sample.match(/(?:参考答案|正确答案|答案)\s*[:：]/g) || []).length;
    const embedMarks = (sample.match(/Office_|_123456|Times New Roman|System|MathType/g) || []).length;
    const badRatio = sample ? badChars / sample.length : 1;
    const visibleChars = visibleSample.replace(/\s/g, "").length;
    const nonAsciiChars = Array.from(visibleSample).filter((char) => !/\s/.test(char) && !/^[\x00-\x7F]$/.test(char)).length;
    const cjkRatio = visibleChars ? cjkChars / visibleChars : 0;
    const nonAsciiRatio = visibleChars ? nonAsciiChars / visibleChars : 0;

    if (!sample.trim()) {
      throw new Error("未读取到有效文本。");
    }
    if (
      badRatio > 0.02
      || (embedMarks >= 3 && cjkChars < 80 && answerMarks === 0)
      || (visibleChars > 100 && cjkRatio < 0.05 && nonAsciiRatio > 0.45)
    ) {
      throw new Error(`${fileName} 读取结果像乱码，请通过 python server.py 启动后重新导入，或另存为 docx 后再试。`);
    }
  }

  function parseQuestionText(text, sourceName) {
    const normalized = normalizeText(text);
    const sections = splitSections(normalized);
    const questions = [];

    for (const section of sections) {
      for (const block of splitQuestionBlocks(section.content, section.type)) {
        const parsed = parseBlock(block, section.type, sourceName);
        if (parsed) {
          parsed.chapter = parsed.chapter || section.chapter || "";
          questions.push(parsed);
        }
      }
    }

    return questions;
  }

  function normalizeText(text) {
    const normalized = String(text || "")
      .replace(/\r/g, "\n")
      .replace(/\[\[(IMG|TABLE)\.\s*/g, "[[$1:")
      .replace(/EMBED\s+Equation\.3/gi, "[公式]")
      .replace(/[□�]{2,}/g, "[公式]")
      .replace(/[□�]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/(?:参考答案|正确答案|答案)\s*[:：]/g, "答案：");

    return withRichTokensProtected(normalized, (value) => value
      .replace(/选项\s*([A-HＡ-Ｈ])\s*[）).．、:：]\s*/g, (_, key) => `${normalizeOptionKey(key)}. `)
      .replace(optionMarkerPattern(), (...args) => normalizeOptionMarkerMatch(args)))
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function withRichTokensProtected(value, transform) {
    const tokens = [];
    const protectedValue = String(value || "").replace(/\[\[(?:IMG|TABLE):[\s\S]*?\]\]/g, (token) => {
      const placeholder = `\uE000${tokens.length}\uE000`;
      tokens.push(token);
      return placeholder;
    });
    return transform(protectedValue).replace(/\uE000(\d+)\uE000/g, (_, index) => tokens[Number(index)] || "");
  }

  function splitSections(text) {
    const pattern = /(?:^|\n)\s*(?:[一二三四五六七八九十]+|\d+)[、.．]\s*(单选题|单项选择题|选择题|多选题|多项选择题|判断题|填空题|简答题|问答题|主观题|论述题)[^\n]*/g;
    const matches = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        index: match.index,
        end: pattern.lastIndex,
        type: sectionTypeFromTitle(match[1]),
        chapter: findChapterBefore(text, match.index)
      });
    }

    if (!matches.length) {
      return [{ type: "auto", content: text }];
    }

    const sections = [];
    const leading = text.slice(0, matches[0].index).trim();
    if (leading) {
      sections.push({
        type: "auto",
        chapter: "",
        content: leading
      });
    }

    return sections.concat(matches.map((item, index) => {
      const next = matches[index + 1];
      return {
        type: item.type,
        chapter: item.chapter,
        content: text.slice(item.end, next ? next.index : text.length).trim()
      };
    }));
  }

  function sectionTypeFromTitle(title) {
    if (/判断/.test(title)) return "judge";
    if (/多选|多项/.test(title)) return "multi";
    if (/填空/.test(title)) return "blank";
    if (/简答|问答|主观|论述/.test(title)) return "short";
    return "single";
  }

  function findChapterBefore(text, index) {
    const lines = String(text || "")
      .slice(0, Math.max(0, index))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse();
    return lines.find((line) => isChapterHeading(line) || isQuestionContextHeading(line)) || "";
  }

  function isChapterHeading(line) {
    const text = String(line || "").trim();
    if (!text || text.length > 40) return false;
    if (isQuestionStartLine(text) || /^[A-HＡ-Ｈ]\s*[.．、:：)）]/.test(text)) return false;
    if (/答案[:：]|单选题|单项选择题|选择题|多选题|多项选择题|判断题|填空题|简答题|问答题|论述题/.test(text)) return false;
    return /^(导论|绪论|总论|第[一二三四五六七八九十\d]+[章节篇]|专题|模块|知识点)/.test(text);
  }

  function splitQuestionBlocks(content, type) {
    const prepared = content
      .replace(/答案：\s*([A-H])(?=\s*(?:知识点|难度|(?:\d{1,3}\s*[、.．)])))/gi, "答案：$1\n")
      .replace(/答案：\s*(正确|错误|对|错|√|×)(?=\s*(?:知识点|难度|(?:\d{1,3}\s*[、.．)])))/g, "答案：$1\n");
    const lines = prepared
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const questionStartCount = countQuestionStartLines(lines);
    if (
      questionStartCount >= 3
      || (type !== "auto" && questionStartCount >= 1)
      || (type === "auto" && questionStartCount >= 1 && looksLikeNumberedQuestionContent(lines))
    ) {
      return splitNumberedQuestionBlocks(lines, type);
    }

    const blocks = [];
    let buffer = "";

    for (const line of lines) {
      buffer = buffer ? `${buffer}\n${line}` : line;
      if (/答案：/.test(line)) {
        blocks.push(buffer);
        buffer = "";
      }
    }

    if (buffer && /答案：/.test(buffer)) blocks.push(buffer);
    return blocks.filter((block) => type !== "judge" || !hasChoiceOptions(block));
  }

  function countQuestionStartLines(lines) {
    return lines.filter((line) => isQuestionStartLine(line)).length;
  }

  function looksLikeNumberedQuestionContent(lines) {
    const text = lines.join("\n");
    const hasInlineObjectiveAnswer = /[（(]\s*(?:[A-HＡ-Ｈ](?:\s*[,，、]?\s*[A-HＡ-Ｈ])*|正确|错误|对|错|√|×)\s*[）)]/i.test(text);
    const hasChoiceOptionMarker = /(?:^|\n|\s)[A-HＡ-Ｈ]\s*[.．、:：)）]\s*\S/.test(text);
    return hasInlineObjectiveAnswer && hasChoiceOptionMarker;
  }

  function splitNumberedQuestionBlocks(lines, type) {
    const blocks = [];
    let buffer = [];
    let pendingVisual = [];
    let pendingChapter = "";

    for (const line of lines) {
      if (isChapterHeading(line) || isQuestionContextHeading(line)) {
        if (buffer.length) {
          blocks.push(buffer.join("\n"));
          buffer = [];
        }
        pendingVisual = [];
        pendingChapter = normalizeQuestionContext(line);
        continue;
      }

      if (isQuestionStartLine(line)) {
        if (buffer.length) {
          blocks.push(buffer.join("\n"));
        }
        buffer = [
          ...(pendingChapter ? [`来源：${pendingChapter}`] : []),
          line,
          ...pendingVisual
        ];
        pendingVisual = [];
        continue;
      }

      if (!buffer.length) {
        if (isVisualOnlyLine(line) || isFigureCaptionLine(line)) {
          pendingVisual.push(line);
        } else {
          pendingVisual = [];
        }
        continue;
      }

      buffer.push(line);
      if (/答案：/.test(line)) {
        blocks.push(buffer.join("\n"));
        buffer = [];
      }
    }

    if (buffer.length) blocks.push(buffer.join("\n"));

    return blocks.filter((block) => type !== "judge" || !hasChoiceOptions(block));
  }

  function isQuestionStartLine(line) {
    return /^\s*(?:难度\s*[:：]?\s*\S+\s*)?\d{1,3}\s*[、.．)]\s*\S/.test(line);
  }

  function isVisualOnlyLine(line) {
    const cleaned = String(line || "")
      .replace(/\[\[(?:IMG|TABLE):[\s\S]*?\]\]/g, "")
      .replace(/\s+/g, "");
    return /\[\[(?:IMG|TABLE):/.test(line) && cleaned.length === 0;
  }

  function isFigureCaptionLine(line) {
    return /^图\s*[一二三四五六七八九十\d]+(?:\s+图\s*[一二三四五六七八九十\d]+)*$/.test(String(line || "").trim());
  }

  function isQuestionContextHeading(line) {
    const text = String(line || "").trim();
    if (!text || text.length > 70) return false;
    if (/^\d+$/.test(text)) return false;
    if (isQuestionStartLine(text) || /^[A-HＡ-Ｈ]\s*[.．、:：)）]/.test(text)) return false;
    if (/答案[:：]/.test(text)) return false;
    if (/^(?:第[一二三四五六七八九十\d]+[章节篇]|导论|绪论|总论|专题|模块|知识点)/.test(text)) return true;
    if (/《[^》]+》/.test(text) && /(试卷|试题|题库|练习|模拟)/.test(text)) return true;
    if (/(?:^|\s)(?:试卷|试题)\s*\d+\s*$/.test(text)) return true;
    return false;
  }

  function extractBlockChapter(block) {
    const match = String(block || "").match(/^(?:章节|来源)：([^\n]+)\n([\s\S]*)$/);
    if (!match) {
      return { chapter: "", content: String(block || "") };
    }
    return {
      chapter: normalizeQuestionContext(match[1]),
      content: match[2].trim()
    };
  }

  function parseBlock(block, type, sourceName) {
    const chapterBlock = extractBlockChapter(block);
    const blockContent = chapterBlock.content;
    if (isSuspiciousBlock(blockContent)) return null;
    const answerMatch = blockContent.match(/(?:参考答案|正确答案|答案)\s*[:：]\s*([\s\S]+)$/);
    const knowledgePoint = extractKnowledgePoint(blockContent);
    const originNumber = extractOriginalQuestionNumber(blockContent);
    let body = "";
    let rawAnswer = "";
    let inlineChoice = null;
    let inlineJudge = null;

    if (answerMatch) {
      body = stripAnswerLeakBeforeOptions(blockContent.slice(0, answerMatch.index).trim());
      rawAnswer = answerMatch[1].trim();
    } else {
      inlineJudge = extractInlineJudgeAnswer(blockContent);
      if (inlineJudge && (type === "judge" || type === "auto")) {
        body = cleanupStem(inlineJudge.body);
        rawAnswer = inlineJudge.answer;
      } else {
        inlineChoice = extractInlineChoiceAnswer(blockContent);
        if (!inlineChoice) return null;
        body = stripAnswerLeakBeforeOptions(cleanupStem(inlineChoice.body));
        rawAnswer = inlineChoice.answer;
      }
    }

    const parsedType = type === "auto" ? inferType(body, rawAnswer, sourceName) : type;

    if (parsedType === "judge") {
      const answer = normalizeJudgeAnswer(rawAnswer);
      if (!answer) return null;
      return {
        id: createId(),
        type: "judge",
        sourceName,
        stem: cleanQuestionStem(stripJudgeOptions(body)),
        options: [
          { key: "正确", text: "正确" },
          { key: "错误", text: "错误" }
        ],
        answer,
        knowledgePoint,
        originNumber,
        chapter: chapterBlock.chapter,
        raw: blockContent
      };
    }

    if (parsedType === "single") {
      const options = parseOptions(body);
      const answer = normalizeOptionAnswer(rawAnswer).slice(0, 1);
      if (!answer || options.length < 2 || !options.stem) return null;
      const normalized = normalizeSingleQuestionMedia(cleanQuestionStem(options.stem), options);
      return {
        id: createId(),
        type: "single",
        sourceName,
        stem: normalized.stem,
        options: normalized.options,
        answer,
        knowledgePoint,
        originNumber,
        chapter: chapterBlock.chapter,
        raw: blockContent
      };
    }

    if (parsedType === "multi") {
      const options = parseOptions(body);
      const answer = normalizeOptionAnswer(rawAnswer);
      if (!answer || answer.length < 2 || options.length < 2 || !options.stem) return null;
      const normalized = normalizeSingleQuestionMedia(cleanQuestionStem(options.stem), options);
      return {
        id: createId(),
        type: "multi",
        sourceName,
        stem: normalized.stem,
        options: normalized.options,
        answer,
        knowledgePoint,
        originNumber,
        chapter: chapterBlock.chapter,
        raw: blockContent
      };
    }

    if (parsedType === "blank") {
      const stem = cleanFillOrShortStem(body);
      if (!stem || !rawAnswer) return null;
      return {
        id: createId(),
        type: "blank",
        sourceName,
        stem,
        options: [],
        answer: cleanReferenceAnswer(rawAnswer),
        knowledgePoint,
        originNumber,
        chapter: chapterBlock.chapter,
        raw: blockContent
      };
    }

    if (parsedType === "short") {
      const stem = cleanFillOrShortStem(body);
      if (!stem || !rawAnswer) return null;
      return {
        id: createId(),
        type: "short",
        sourceName,
        stem,
        options: [],
        answer: cleanReferenceAnswer(rawAnswer),
        knowledgePoint,
        originNumber,
        chapter: chapterBlock.chapter,
        raw: blockContent
      };
    }

    return null;
  }

  function inferType(body, rawAnswer, sourceName) {
    if (normalizeJudgeAnswer(rawAnswer)) return "judge";
    const choiceAnswer = normalizeOptionAnswer(rawAnswer);
    if (choiceAnswer && parseOptions(body).length >= 2) return choiceAnswer.length > 1 ? "multi" : "single";
    if (/填空/.test(String(sourceName || "")) || /_{2,}|＿{2,}|-{3,}/.test(body)) return "blank";
    if (/简答|问答|主观|论述/.test(String(sourceName || ""))) return "short";
    return "";
  }

  function extractInlineChoiceAnswer(block) {
    const source = String(block || "");
    const optionStart = findFirstStandaloneOptionIndex(source);
    if (optionStart <= 0) return null;
    const stemPart = source.slice(0, optionStart);
    const optionPart = source.slice(optionStart);
    const matches = Array.from(stemPart.matchAll(/[（(]\s*([A-HＡ-Ｈ](?:\s*[,，、]?\s*[A-HＡ-Ｈ])*)\s*[）)]/gi));
    const last = matches[matches.length - 1];
    if (!last) return null;

    const answer = normalizeOptionAnswer(last[1]);
    if (!answer) return null;
    const before = stemPart.slice(0, last.index);
    const after = stemPart.slice(last.index + last[0].length);
    const blank = last[0].startsWith("（") ? "（ ）" : "( )";
    return {
      answer,
      body: `${before}${blank}${after}${optionPart}`
    };
  }

  function extractInlineJudgeAnswer(block) {
    const source = String(block || "");
    const matches = Array.from(source.matchAll(/[（(]\s*(正确|错误|对|错|√|×|T|F|true|false)\s*[）)]/gi));
    const last = matches[matches.length - 1];
    if (!last) return null;
    const answer = normalizeJudgeAnswer(last[1]);
    if (!answer) return null;
    return {
      answer,
      body: `${source.slice(0, last.index)}${source.slice(last.index + last[0].length)}`
    };
  }

  function findFirstStandaloneOptionIndex(value) {
    const match = String(value || "").match(/(?:^|\n)\s*(?:选项\s*)?[A-HＡ-Ｈ]\s*[.．、:：)）]\s*/);
    return match ? (match.index + (match[0].match(/^\n/) ? 1 : 0)) : -1;
  }

  function extractKnowledgePoint(value) {
    const match = String(value || "").match(/知识点\s*[:：]\s*(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function extractOriginalQuestionNumber(value) {
    const match = String(value || "").match(/^\s*(?:难度\s*[:：]?\s*\S+\s*)?(\d{1,3})\s*[、.．)]\s*\S/);
    return match ? Number(match[1]) : null;
  }

  function normalizeQuestionContext(value) {
    const text = String(value || "")
      .replace(/^(?:章节|来源)\s*[:：]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || /^\d+$/.test(text)) return "";
    return text;
  }

  function questionContextLabel(value) {
    const text = normalizeQuestionContext(value);
    if (!text) return "";
    if (/试卷|试题|套题|模拟|练习/.test(text)) return "试卷";
    if (/^第[一二三四五六七八九十\d]+[章节篇]|^导论|^绪论|^总论|^专题|^模块|^知识点/.test(text)) return "章节";
    return "来源";
  }

  function inferMissingQuestionContexts(questions) {
    const groups = new Map();
    questions.forEach((question, index) => {
      const key = question.importId || question.sourceName || "__unknown__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ question, index });
    });

    for (const group of groups.values()) {
      if (!group.some(({ question }) => shouldInferPaperContext(question))) continue;
      let inferredPaper = 1;
      let last = null;

      for (const item of group.sort((a, b) => a.index - b.index)) {
        const question = item.question;
        const origin = Number(question.originNumber ?? extractOriginalQuestionNumber(question.raw || ""));
        if (last && isLikelyNextPaperBoundary(last, question, origin)) {
          inferredPaper += 1;
        }

        if (!normalizeQuestionContext(question.chapter || "")) {
          question.chapter = `第 ${inferredPaper} 套（推断）`;
        }

        if (Number.isFinite(origin)) {
          question.originNumber = origin;
          last = { type: question.type, origin };
        }
      }
    }

    return questions;
  }

  function shouldInferPaperContext(question) {
    const sourceName = String(question && question.sourceName ? question.sourceName : "");
    if (normalizeQuestionContext(question && question.chapter ? question.chapter : "")) return false;
    return /\.pdf$/i.test(sourceName) || /套题|试卷|试题/.test(sourceName);
  }

  function isLikelyNextPaperBoundary(last, question, origin) {
    if (!last || !Number.isFinite(origin) || !Number.isFinite(last.origin)) return false;
    if (origin > 3 || last.origin <= origin) return false;
    if (question.type === last.type) return true;
    return question.type === "single" || question.type === "judge";
  }

  function isSuspiciousBlock(block) {
    const text = String(block || "");
    const imageCount = (text.match(/\[\[IMG:/g) || []).length;
    const visibleText = text.replace(/\[\[(?:IMG|TABLE):[\s\S]*?\]\]/g, "[media]");
    if (visibleText.length > 120000) return true;
    if (imageCount > 12) return true;
    return false;
  }

  function parseOptions(body) {
    const markers = [];
    const pattern = optionMarkerPattern();
    const tokenRanges = getRichTokenRanges(body);
    let match;

    while ((match = pattern.exec(body)) !== null) {
      const prefix = match[1] || "";
      const key = match[2] || match[3];
      const markerIndex = match.index + prefix.length;
      if (isInsideRanges(markerIndex, tokenRanges)) continue;
      markers.push({
        key: normalizeOptionKey(key),
        index: markerIndex,
        textStart: match.index + match[0].length
      });
    }

    const unique = [];
    const used = new Set();
    for (const marker of markers) {
      if (used.has(marker.key)) continue;
      used.add(marker.key);
      unique.push(marker);
    }

    if (unique.length < 2) {
      const empty = [];
      empty.stem = cleanupStem(body);
      return empty;
    }

    const options = unique.map((item, index) => {
      const next = unique[index + 1];
      return {
        key: item.key,
        text: cleanOptionText(body.slice(item.textStart, next ? next.index : body.length).trim())
      };
    }).filter((option) => option.text)
      .sort((a, b) => optionKeyOrder(a.key) - optionKeyOrder(b.key));

    options.stem = cleanupStem(body.slice(0, unique[0].index));
    return options;
  }

  function getRichTokenRanges(value) {
    const ranges = [];
    const pattern = /\[\[(?:IMG|TABLE):[\s\S]*?\]\]/g;
    let match;
    while ((match = pattern.exec(String(value || ""))) !== null) {
      ranges.push([match.index, pattern.lastIndex]);
    }
    return ranges;
  }

  function isInsideRanges(index, ranges) {
    return ranges.some(([start, end]) => index >= start && index < end);
  }

  function cleanOptionText(value) {
    return String(value || "")
      .replace(/^\s*[A-HＡ-Ｈ]\s*[.．、:：)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSingleQuestionMedia(stem, options) {
    let nextStem = stem;
    const nextOptions = options.map((option) => ({ ...option }));
    const referencesFigure = referencesVisual(stem);

    for (const option of nextOptions) {
      const split = splitLargeMediaFromOptionText(option.text, referencesFigure);
      option.text = split.text;
      if (split.media) {
        nextStem = `${nextStem}\n${split.media}`.trim();
      }
      const visualText = splitTrailingVisualText(option.text, referencesFigure);
      option.text = visualText.text;
      if (visualText.media) {
        nextStem = `${nextStem}\n${visualText.media}`.trim();
      }
    }

    return {
      stem: nextStem,
      options: nextOptions.map((option) => ({
        ...option,
        text: removeTrailingFigureCaptions(option.text)
      })).filter((option) => option.text)
        .sort((a, b) => optionKeyOrder(a.key) - optionKeyOrder(b.key))
    };
  }

  function splitLargeMediaFromOptionText(value, referencesFigure) {
    const source = String(value || "");
    const pattern = /\[\[(IMG|TABLE):([\s\S]*?)\]\]/g;
    const moved = [];
    let output = "";
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      const token = match[0];
      const shouldMove = isMoveableQuestionVisual(match[1], match[2], referencesFigure);
      output += source.slice(lastIndex, match.index);
      if (shouldMove) {
        moved.push(token);
      } else {
        output += token;
      }
      lastIndex = pattern.lastIndex;
    }

    output += source.slice(lastIndex);
    if (moved.length) {
      const caption = output.match(/\s*(图\s*[一二三四五六七八九十\d]+(?:\s+图\s*[一二三四五六七八九十\d]+)*)\s*$/);
      if (caption) {
        moved.push(caption[1]);
        output = output.slice(0, caption.index);
      }
    }

    return {
      text: output.replace(/\s+/g, " ").trim(),
      media: moved.join("\n")
    };
  }

  function splitTrailingVisualText(value, referencesFigure) {
    const text = String(value || "").trim();
    if (!referencesFigure) return { text, media: "" };
    const match = text.match(/^(.{1,10}?)[\s　]+((?:[01x×]\s*){10,}.*)$/i);
    if (!match) return { text, media: "" };
    return {
      text: match[1].trim(),
      media: match[2].trim()
    };
  }

  function isMoveableQuestionVisual(kind, payload, referencesFigure) {
    if (kind === "TABLE") return referencesFigure;
    const image = parseImagePayload(payload);
    if (!image) return false;
    const width = image.width || 0;
    const height = image.height || 0;
    const area = width * height;
    const looksLikeDiagram = width >= 180 && height >= 55;
    const veryLarge = width >= 260 || height >= 110 || area >= 22000;
    return veryLarge || (referencesFigure && looksLikeDiagram);
  }

  function parseImagePayload(payload) {
    const value = String(payload || "");
    const withSize = value.match(/^(\d+)x(\d+):(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)$/);
    if (withSize) {
      return {
        width: Number(withSize[1]),
        height: Number(withSize[2]),
        src: withSize[3]
      };
    }
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value)) {
      return {
        width: 0,
        height: 0,
        src: value
      };
    }
    return null;
  }

  function referencesVisual(value) {
    return /图\s*[一二三四五六七八九十\d]|表\s*[一二三四五六七八九十\d]|下图|右图|如图|图示|所示|如下|电路|波形|状态图|状态转换图|真值表|卡诺图/.test(String(value || ""));
  }

  function optionKeyOrder(key) {
    const index = "ABCDEFGH".indexOf(String(key || "").toUpperCase());
    return index === -1 ? 99 : index;
  }

  function normalizeOptionKey(key) {
    const value = String(key || "");
    const code = value.charCodeAt(0);
    if (code >= 0xff21 && code <= 0xff28) {
      return String.fromCharCode(code - 0xfee0);
    }
    return value.toUpperCase();
  }

  function normalizeOptionAnswer(value) {
    const letters = String(value || "")
      .replace(/[Ａ-Ｈ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .toUpperCase()
      .match(/[A-H]/g) || [];
    return Array.from(new Set(letters)).sort((a, b) => optionKeyOrder(a) - optionKeyOrder(b)).join("");
  }

  function optionMarkerPattern() {
    return /(^|[\s\n）)])([A-HＡ-Ｈ])(?:\s*\)\s*|\s*(?=\[\[(?:IMG|TABLE):))|([A-HＡ-Ｈ])\s*[.．、:：]\s*/g;
  }

  function normalizeOptionMarkerMatch(args) {
    const match = args[0];
    const prefix = args[1] || "";
    const key = args[2] || args[3];
    if (!key) return match;
    if (args[3]) return `${normalizeOptionKey(key)}. `;
    return `${prefix}${normalizeOptionKey(key)}. `;
  }

  function removeTrailingFigureCaptions(value) {
    return String(value || "")
      .replace(/\s*图\s*[一二三四五六七八九十\d]+(?:\s+图\s*[一二三四五六七八九十\d]+)*\s*$/g, "")
      .trim();
  }

  function hasChoiceOptions(value) {
    return parseOptions(value).length >= 2;
  }

  function stripJudgeOptions(value) {
    return cleanupStem(String(value || "").replace(/[（(]\s*[）)]\s*$/, ""));
  }

  function cleanupStem(value) {
    return String(value || "")
      .replace(/^\s*知识点\s*[:：]\s*\S+\s*难易度\s*[:：]\s*\S+\s*认知度\s*[:：]\s*\S+\s*/, "")
      .replace(/^\s*难度\s*[:：]?\s*\S+\s*/, "")
      .replace(/^\s*\d+\s*[、.．)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanQuestionStem(value) {
    return cleanupStem(value)
      .replace(/[（(]\s*[A-HＡ-Ｈ](?:\s*[,，、]?\s*[A-HＡ-Ｈ])*\s*[）)]\s*$/i, "（ ）")
      .replace(/[（(]\s*$/g, "（ ）")
      .replace(/[（(]\s*[）)]/g, "（ ）")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanFillOrShortStem(value) {
    return cleanupStemPreserveLines(value)
      .replace(/_{2,}|＿{2,}|-{3,}/g, "________")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanupStemPreserveLines(value) {
    return String(value || "")
      .replace(/^\s*知识点\s*[:：]\s*\S+\s*难易度\s*[:：]\s*\S+\s*认知度\s*[:：]\s*\S+\s*/, "")
      .replace(/^\s*难度\s*[:：]?\s*\S+\s*/, "")
      .replace(/^\s*\d+\s*[、.．)]\s*/, "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function cleanReferenceAnswer(value) {
    return String(value || "")
      .replace(/^\s*参考答案\s*[:：]\s*/g, "")
      .replace(/\s+$/g, "")
      .trim();
  }

  function stripAnswerLeakBeforeOptions(value) {
    return String(value || "")
      .replace(/([（(]\s*)[A-HＡ-Ｈ]\s*[.．、:：)]\s+(?=[A-HＡ-Ｈ]\s*[.．、:：)]|[A-HＡ-Ｈ]\s*(?:\[\[(?:IMG|TABLE):))/g, "$1");
  }

  function answerLeakBeforeOptionListPattern() {
    return /([（(])\s*[A-HＡ-Ｈ]\s*([）)])(?=\s*[A-HＡ-Ｈ]\s*[.．、:：])/g;
  }

  function normalizeJudgeAnswer(value) {
    const text = String(value || "")
      .trim()
      .replace(/[。；;，,、\s]/g, "")
      .toLowerCase();
    if (/^(正确|对|√|true|t)$/.test(text)) return "正确";
    if (/^(错误|错|×|false|f)$/.test(text)) return "错误";
    return "";
  }

  function render() {
    renderSubjects();
    renderImports();
    renderHeader();
    renderTabs();
    renderCurrentView();
    scheduleSave();
  }

  function renderSubjects() {
    els.subjectCount.textContent = `${state.subjects.length} 个`;
    els.subjectList.innerHTML = "";
    for (const subject of state.subjects) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `subject-item${subject.id === state.activeSubjectId ? " active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(subject.name)}</strong><span>${subject.questions.length} 题</span>`;
      button.addEventListener("click", () => {
        state.activeSubjectId = subject.id;
        resetPractice(false);
        render();
      });
      els.subjectList.appendChild(button);
    }
  }

  function renderImports() {
    const subject = getActiveSubject();
    const imports = subject ? subject.imports : [];
    els.importedCount.textContent = `${imports.length} 个`;
    els.importedList.innerHTML = "";

    if (!imports.length) {
      els.importedList.innerHTML = `<div class="blank-message">暂无导入文件。</div>`;
      return;
    }

    for (const item of imports) {
      const row = document.createElement("div");
      row.className = "imported-item";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.fileName)}</strong>
          <span>${item.count} 题</span>
        </div>
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete-btn";
      button.textContent = "删除";
      button.addEventListener("click", () => deleteImport(item.id));
      row.appendChild(button);
      els.importedList.appendChild(row);
    }
  }

  function deleteImport(importId) {
    const subject = getActiveSubject();
    if (!subject) return;
    const removedIds = new Set(
      subject.questions
        .filter((question) => question.importId === importId)
        .map((question) => question.id)
    );
    subject.questions = subject.questions.filter((question) => question.importId !== importId);
    subject.imports = subject.imports.filter((item) => item.id !== importId);
    for (const id of removedIds) {
      subject.wrongIds.delete(id);
      subject.answered.delete(id);
    }
    resetPractice(false);
    render();
  }

  function renderHeader() {
    const subject = getActiveSubject();
    const questions = subject ? subject.questions : [];
    const counts = countTypes(questions);
    els.activeSubjectName.textContent = subject ? subject.name : "未选择";
    els.stats.innerHTML = "";
    [
      ["总题", questions.length],
      ["单选", counts.single],
      ["多选", counts.multi],
      ["判断", counts.judge],
      ["填空", counts.blank],
      ["简答", counts.short],
      ["错题", subject ? subject.wrongIds.size : 0]
    ].forEach(([label, count]) => {
      const span = document.createElement("span");
      span.className = "stat-pill";
      span.textContent = `${label} ${count}`;
      els.stats.appendChild(span);
    });
  }

  function renderTabs() {
    const subject = getActiveSubject();
    const shouldShowEmpty = !subject || subject.questions.length === 0;
    els.emptyState.classList.toggle("show", shouldShowEmpty);

    els.tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === state.activeView);
    });

    els.views.forEach((view) => {
      view.classList.toggle("active", !shouldShowEmpty && view.id === `${state.activeView}View`);
    });
  }

  function renderCurrentView() {
    const subject = getActiveSubject();
    if (!subject || !subject.questions.length) return;
    if (state.activeView === "practice") renderPractice();
    if (state.activeView === "wrong") renderQuestionList(els.wrongArea, getQuestionsByIds(subject.wrongIds), "暂无错题。");
    if (state.activeView === "preview") renderPreview();
    if (state.activeView === "exam") renderExam();
  }

  function resetPractice(shuffle) {
    const subject = getActiveSubject();
    const questions = filterQuestions(subject ? subject.questions : [], state.practiceMode);
    state.practiceOrder = questions.map((question) => question.id);
    if (shuffle) {
      shuffleArray(state.practiceOrder);
      updatePracticeIndex(0, false);
      return;
    }
    const savedIndex = subject && subject.practiceProgress
      ? subject.practiceProgress[state.practiceMode] || 0
      : 0;
    updatePracticeIndex(Math.min(savedIndex, Math.max(0, state.practiceOrder.length - 1)), false);
  }

  function updatePracticeIndex(index, save = true) {
    const subject = getActiveSubject();
    state.practiceIndex = Math.max(0, index);
    if (subject) {
      subject.practiceProgress = normalizePracticeProgress(subject.practiceProgress);
      subject.practiceProgress[state.practiceMode] = state.practiceIndex;
    }
    if (save) scheduleSave();
  }

  function renderPractice() {
    const subject = getActiveSubject();
    document.querySelectorAll("[data-practice-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.practiceMode === state.practiceMode);
    });

    const questions = filterQuestions(subject.questions, state.practiceMode);
    if (!questions.length) {
      els.practiceArea.innerHTML = `<div class="blank-message">当前筛选下没有题目。</div>`;
      return;
    }

    if (!state.practiceOrder.length) resetPractice(false);
    const id = state.practiceOrder[Math.min(state.practiceIndex, state.practiceOrder.length - 1)];
    const question = subject.questions.find((item) => item.id === id) || questions[0];
    els.practiceArea.innerHTML = "";
    els.practiceArea.appendChild(createQuestionCard(question, `${state.practiceIndex + 1} / ${state.practiceOrder.length}`));
  }

  function createQuestionCard(question, indexText) {
    const subject = getActiveSubject();
    const card = document.getElementById("questionTemplate").content.firstElementChild.cloneNode(true);
    card.querySelector(".question-meta").innerHTML = `
      <span class="type-pill">${typeLabels[question.type]}</span>
      <span>${escapeHtml(indexText)}</span>
      ${renderQuestionScopeMeta(question)}
    `;
    appendRichContent(card.querySelector("h3"), question.stem);

    const optionArea = card.querySelector(".options");
    const answerPanel = card.querySelector(".answer-panel");

    if (isSelfCheckedQuestion(question)) {
      const selfInput = document.createElement("textarea");
      selfInput.className = "self-answer-input";
      selfInput.rows = question.type === "short" ? 5 : 2;
      selfInput.placeholder = "可以在这里写下自己的答案，也可以直接查看参考答案。";
      optionArea.appendChild(selfInput);

      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "option-btn";
      revealBtn.textContent = "显示参考答案";
      revealBtn.addEventListener("click", () => {
        answerPanel.innerHTML = `<strong>参考答案：</strong>${escapeHtml(question.answer || "暂无")}`;
        answerPanel.classList.add("show");
      });

      const rightBtn = document.createElement("button");
      rightBtn.type = "button";
      rightBtn.className = "option-btn";
      rightBtn.textContent = "记为答对";
      rightBtn.addEventListener("click", () => {
        subject.answered.set(question.id, "self-correct");
        subject.wrongIds.delete(question.id);
        answerPanel.innerHTML = `<strong>已记为答对。</strong>参考答案：${escapeHtml(question.answer || "暂无")}`;
        answerPanel.classList.add("show");
        renderHeader();
        scheduleSave();
      });

      const wrongBtn = document.createElement("button");
      wrongBtn.type = "button";
      wrongBtn.className = "option-btn";
      wrongBtn.textContent = "记为答错";
      wrongBtn.addEventListener("click", () => {
        subject.answered.set(question.id, "self-wrong");
        subject.wrongIds.add(question.id);
        answerPanel.innerHTML = `<strong>已加入错题。</strong>参考答案：${escapeHtml(question.answer || "暂无")}`;
        answerPanel.classList.add("show");
        renderHeader();
        scheduleSave();
      });

      const actions = document.createElement("div");
      actions.className = "self-check-actions";
      actions.append(revealBtn, rightBtn, wrongBtn);
      optionArea.appendChild(actions);
      appendQuestionNavigation(card);
      return card;
    }

    if (question.type === "multi") {
      const checkboxes = [];
      for (const item of question.options) {
        const label = document.createElement("label");
        label.className = "option-btn multi-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = item.key;
        const key = document.createElement("strong");
        key.textContent = item.key;
        const text = document.createElement("span");
        appendRichContent(text, item.text);
        label.append(input, key, text);
        checkboxes.push(input);
        optionArea.appendChild(label);
      }

      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.className = "option-btn";
      submitBtn.textContent = "提交答案";
      submitBtn.addEventListener("click", () => {
        const answer = normalizeOptionAnswer(checkboxes.filter((input) => input.checked).map((input) => input.value).join(""));
        const result = evaluateMultiAnswer(answer, question.answer);
        const isCorrect = result.status === "correct";
        subject.answered.set(question.id, answer);
        if (isCorrect) {
          subject.wrongIds.delete(question.id);
        } else {
          subject.wrongIds.add(question.id);
        }

        optionArea.querySelectorAll(".multi-option").forEach((optionLabel) => {
          const input = optionLabel.querySelector("input");
          const key = input.value;
          input.disabled = true;
          applyMultiAnswerClasses(optionLabel, key, result);
        });
        submitBtn.disabled = true;
        answerPanel.innerHTML = renderMultiAnswerFeedback(result);
        answerPanel.classList.add("show");
        renderHeader();
        scheduleSave();
      });
      optionArea.appendChild(submitBtn);
      appendQuestionNavigation(card);
      return card;
    }

    for (const item of question.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn";
      const key = document.createElement("strong");
      key.textContent = item.key;
      const text = document.createElement("span");
      appendRichContent(text, item.text);
      button.append(key, text);
      button.addEventListener("click", () => {
        const isCorrect = item.key === question.answer;
        subject.answered.set(question.id, item.key);
        if (isCorrect) {
          subject.wrongIds.delete(question.id);
        } else {
          subject.wrongIds.add(question.id);
        }

        optionArea.querySelectorAll(".option-btn").forEach((optionButton) => {
          const key = optionButton.querySelector("strong").textContent;
          optionButton.disabled = true;
          optionButton.classList.toggle("correct", key === question.answer);
          optionButton.classList.toggle("wrong", key === item.key && !isCorrect);
        });

        answerPanel.innerHTML = isCorrect
          ? `<strong>回答正确。</strong>答案：${escapeHtml(question.answer)}`
          : `<strong>回答错误。</strong>正确答案：${escapeHtml(question.answer)}`;
        answerPanel.classList.add("show");
        renderHeader();
        scheduleSave();
      });
      optionArea.appendChild(button);
    }

    appendQuestionNavigation(card);
    return card;
  }

  function appendQuestionNavigation(card) {
    const actions = document.createElement("div");
    actions.className = "question-actions";
    const spacer = document.createElement("span");
    const nav = document.createElement("div");
    nav.className = "toolbar-actions";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "上一题";
    prevBtn.disabled = state.practiceIndex === 0;
    prevBtn.addEventListener("click", () => {
      updatePracticeIndex(Math.max(0, state.practiceIndex - 1));
      renderPractice();
    });

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "下一题";
    nextBtn.disabled = state.practiceIndex >= state.practiceOrder.length - 1;
    nextBtn.addEventListener("click", () => {
      updatePracticeIndex(Math.min(state.practiceOrder.length - 1, state.practiceIndex + 1));
      renderPractice();
    });

    nav.append(prevBtn, nextBtn);
    actions.append(spacer, nav);
    card.appendChild(actions);
  }

  function renderPreview() {
    const subject = getActiveSubject();
    renderQuestionList(els.previewArea, filterQuestions(subject.questions, state.previewFilter), "暂无题目。");
  }

  function renderQuestionList(container, questions, emptyText) {
    container.innerHTML = "";
    if (!questions.length) {
      container.innerHTML = `<div class="blank-message">${emptyText}</div>`;
      return;
    }

    const list = document.createElement("div");
    list.className = "compact-list";
    questions.forEach((question, index) => {
      const card = document.createElement("article");
      card.className = "compact-card";
      const type = document.createElement("span");
      type.className = "type-pill";
      type.textContent = typeLabels[question.type];
      const stem = document.createElement("h4");
      appendRichContent(stem, `${index + 1}. ${question.stem}`);
      const options = document.createElement("p");
      (question.options || []).forEach((item, optionIndex) => {
        if (optionIndex) options.appendChild(document.createTextNode("  "));
        const key = document.createElement("strong");
        key.textContent = `${item.key}. `;
        options.appendChild(key);
        appendRichContent(options, item.text);
      });
      const answer = document.createElement("p");
      answer.innerHTML = `<strong>答案：</strong>${escapeHtml(question.answer)}`;
      const source = document.createElement("p");
      source.className = "compact-source";
      source.innerHTML = `<strong>定位：</strong>${renderQuestionScopeMeta(question)}`;
      card.append(type, stem, options, answer, source);
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  function isSelfCheckedQuestion(question) {
    return question && (question.type === "blank" || question.type === "short");
  }

  function evaluateMultiAnswer(selected, correct) {
    const selectedAnswer = normalizeOptionAnswer(selected);
    const correctAnswer = normalizeOptionAnswer(correct);
    const selectedKeys = Array.from(selectedAnswer);
    const correctKeys = Array.from(correctAnswer);
    const wrongKeys = selectedKeys.filter((key) => !correctAnswer.includes(key));
    const missedKeys = correctKeys.filter((key) => !selectedAnswer.includes(key));
    const pickedCorrectKeys = selectedKeys.filter((key) => correctAnswer.includes(key));
    let status = "wrong";

    if (!selectedAnswer) {
      status = "blank";
    } else if (!wrongKeys.length && !missedKeys.length) {
      status = "correct";
    } else if (!wrongKeys.length && pickedCorrectKeys.length && missedKeys.length) {
      status = "partial";
    }

    return {
      status,
      selected: selectedAnswer,
      correct: correctAnswer,
      wrong: wrongKeys.join(""),
      missed: missedKeys.join(""),
      pickedCorrect: pickedCorrectKeys.join("")
    };
  }

  function applyMultiAnswerClasses(optionElement, key, result) {
    const selected = result.selected.includes(key);
    const isCorrectKey = result.correct.includes(key);
    optionElement.classList.toggle("correct", selected && isCorrectKey);
    optionElement.classList.toggle("wrong", selected && !isCorrectKey);
    optionElement.classList.toggle("missed", !selected && isCorrectKey);
  }

  function renderMultiAnswerFeedback(result) {
    const answerText = escapeHtml(result.correct);
    if (result.status === "correct") {
      return `<strong>回答正确。</strong>答案：${answerText}`;
    }
    if (result.status === "partial") {
      return `<strong>部分正确。</strong>漏选：${escapeHtml(formatAnswerLetters(result.missed))}。正确答案：${answerText}`;
    }
    if (result.status === "blank") {
      return `<strong>未作答。</strong>正确答案：${answerText}`;
    }
    const extra = result.missed ? `，漏选：${escapeHtml(formatAnswerLetters(result.missed))}` : "";
    return `<strong>回答错误。</strong>正确答案：${answerText}${extra}`;
  }

  function formatAnswerLetters(value) {
    return Array.from(normalizeOptionAnswer(value)).join("、") || "-";
  }

  function createMcuExam(questions) {
    const used = new Set();
    const items = [];
    const warnings = [];

    for (const section of EXAM_STRATEGY.sections) {
      const selected = selectMcuQuestions(questions, section, used);
      if (selected.questions.length < section.count) {
        warnings.push(`${section.label}题库不足：需要 ${section.count} 题，实际生成 ${selected.questions.length} 题。`);
      }
      selected.questions.forEach((question, index) => {
        items.push({
          id: createId(),
          section: section.label,
          type: section.type,
          sectionIndex: index + 1,
          points: section.points,
          question
        });
      });
    }

    return {
      items,
      answers: {},
      submitted: false,
      result: null,
      warnings,
      title: EXAM_STRATEGY.title,
      summary: "单片机固定策略：选择题 36 题 54 分（19-27 随机抽 8 个知识点），判断题 16 题 16 分，满分 70 分。",
      total: EXAM_STRATEGY.total
    };
  }

  function createGenericExam(questions, counts) {
    const used = new Set();
    const items = [];
    const warnings = [];
    const sections = [
      { type: "single", label: "单选题", count: counts.single, points: 1 },
      { type: "multi", label: "多选题", count: counts.multi, points: 1 },
      { type: "judge", label: "判断题", count: counts.judge, points: 1 },
      { type: "blank", label: "填空题", count: counts.blank, points: 0 },
      { type: "short", label: "简答题", count: counts.short, points: 0 }
    ].filter((section) => section.count > 0);

    for (const section of sections) {
      const pool = questions.filter((question) => question.type === section.type);
      const selected = selectBalancedQuestions(pool, section.count, used);
      if (selected.length < section.count) {
        warnings.push(`${section.label}题库不足：需要 ${section.count} 题，实际生成 ${selected.length} 题。`);
      }
      selected.forEach((question, index) => {
        items.push({
          id: createId(),
          section: section.label,
          type: section.type,
          sectionIndex: index + 1,
          points: section.points,
          question
        });
      });
    }

    const total = items.reduce((sum, item) => sum + item.points, 0);
    return {
      items,
      answers: {},
      submitted: false,
      result: null,
      warnings,
      title: "自定义模拟组卷",
      summary: "自定义组卷：默认按章节或知识点均分抽题；填空和简答不计分，只展示参考答案。",
      total
    };
  }

  function selectBalancedQuestions(pool, count, used) {
    const groups = new Map();
    for (const question of pool) {
      if (used.has(question.id)) continue;
      const key = questionGroupKey(question);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(question);
    }

    let queues = Array.from(groups.values())
      .map((items) => shuffleArray([...items]))
      .sort((a, b) => b.length - a.length);
    const selected = [];
    while (selected.length < count && queues.length) {
      const nextQueues = [];
      for (const queue of queues) {
        const question = queue.shift();
        if (question && !used.has(question.id) && selected.length < count) {
          selected.push(question);
          used.add(question.id);
        }
        if (queue.length) nextQueues.push(queue);
      }
      queues = nextQueues;
    }
    return selected;
  }

  function questionGroupKey(question) {
    if (question.chapter) return `chapter:${question.chapter}`;
    if (question.knowledgePoint !== null && question.knowledgePoint !== undefined) {
      return `knowledge:${question.knowledgePoint}`;
    }
    return "all";
  }

  function selectMcuQuestions(questions, section, used) {
    const pool = questions.filter((question) => question.type === section.type);
    const selected = [];

    for (const selector of section.selectors) {
      if (selector.distinctPoints) {
        const points = takeRandom(
          selector.points.filter((point) => pool.some((question) => (
            !used.has(question.id)
            && Number(question.knowledgePoint) === Number(point)
          ))),
          selector.count
        );
        for (const point of points) {
          const candidates = pool.filter((question) => (
            !used.has(question.id)
            && Number(question.knowledgePoint) === Number(point)
          ));
          for (const question of takeRandom(candidates, 1)) {
            selected.push(question);
            used.add(question.id);
          }
        }
        continue;
      }

      const candidates = pool.filter((question) => (
        !used.has(question.id)
        && selector.points.includes(Number(question.knowledgePoint))
      ));
      for (const question of takeRandom(candidates, selector.count)) {
        selected.push(question);
        used.add(question.id);
      }
    }

    return { questions: selected.slice(0, section.count) };
  }

  function takeRandom(items, count) {
    return shuffleArray([...items]).slice(0, Math.max(0, count));
  }

  function renderExam() {
    if (!els.examArea || !els.examSummary) return;
    const exam = state.exam || createEmptyExam();
    const selectedTotal = exam.items.reduce((sum, item) => sum + item.points, 0);
    const warningText = exam.warnings.length
      ? `<p class="exam-warning">${escapeHtml(exam.warnings.join(" "))}</p>`
      : "";
    const total = exam.total ?? EXAM_STRATEGY.total;
    const summary = exam.summary || "单片机固定策略：选择题 36 题 54 分（19-27 随机抽 8 个知识点），判断题 16 题 16 分，满分 70 分。";
    const resultText = exam.result
      ? `<p><strong>得分：${formatScore(exam.result.score)} / ${formatScore(total)}</strong>，已计分 ${formatScore(selectedTotal)} 分。</p>`
      : `<p>${escapeHtml(summary)}</p>`;

    els.examSummary.innerHTML = `
      ${resultText}
      ${warningText}
    `;
    if (els.submitExamBtn) {
      els.submitExamBtn.disabled = !exam.items.length || exam.submitted;
    }

    els.examArea.innerHTML = "";
    if (!exam.items.length) {
      els.examArea.innerHTML = `<div class="blank-message">导入题库后，可选择“单片机固定策略”或“自定义模拟组卷”。</div>`;
      return;
    }

    const grouped = groupExamItems(exam.items);
    for (const group of grouped) {
      const section = document.createElement("section");
      section.className = "exam-section";
      const title = document.createElement("h3");
      const sectionScore = group.items.reduce((sum, item) => sum + item.points, 0);
      title.textContent = `${group.label}（${group.items.length}题，共${formatScore(sectionScore)}分）`;
      section.appendChild(title);
      group.items.forEach((item, index) => {
        section.appendChild(renderExamItem(item, index + 1, exam));
      });
      els.examArea.appendChild(section);
    }
  }

  function groupExamItems(items) {
    const groups = [];
    for (const item of items) {
      let group = groups.find((entry) => entry.label === item.section);
      if (!group) {
        group = { label: item.section, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }

  function renderExamItem(item, number, exam) {
    const card = document.createElement("article");
    card.className = "question-card exam-card";
    const selected = exam.answers[item.id] || "";
    const multiResult = item.question.type === "multi" ? evaluateMultiAnswer(selected, item.question.answer) : null;
    const correct = exam.submitted
      ? (multiResult ? multiResult.status === "correct" : isExamAnswerCorrect(item, selected))
      : false;
    const meta = document.createElement("div");
    meta.className = "question-meta";
    meta.innerHTML = `
      <span class="type-pill">${escapeHtml(typeLabels[item.type])}</span>
      <span>${escapeHtml(item.section)} ${number}</span>
      <span>${formatScore(item.points)} 分</span>
      ${renderQuestionScopeMeta(item.question)}
    `;
    const stem = document.createElement("h3");
    appendRichContent(stem, item.question.stem);
    card.append(meta, stem);

    if (isSelfCheckedQuestion(item.question)) {
      const input = document.createElement("textarea");
      input.className = "self-answer-input";
      input.rows = item.question.type === "short" ? 5 : 2;
      input.value = selected;
      input.disabled = exam.submitted;
      input.placeholder = "可选填写，交卷后显示参考答案。";
      input.addEventListener("input", () => {
        state.exam.answers[item.id] = input.value;
      });
      card.appendChild(input);

      if (exam.submitted) {
        const panel = document.createElement("div");
        panel.className = "answer-panel show";
        panel.innerHTML = `<strong>参考答案：</strong>${escapeHtml(item.question.answer || "暂无")}`;
        card.appendChild(panel);
      }
      return card;
    }

    const options = document.createElement("div");
    options.className = "options exam-options";
    for (const option of item.question.options) {
      const label = document.createElement("label");
      label.className = "option-btn exam-option";
      const input = document.createElement("input");
      input.type = item.question.type === "multi" ? "checkbox" : "radio";
      input.name = `exam-${item.id}`;
      input.value = option.key;
      input.checked = item.question.type === "multi"
        ? normalizeOptionAnswer(selected).includes(option.key)
        : selected === option.key;
      input.disabled = exam.submitted;
      input.addEventListener("change", () => {
        if (item.question.type === "multi") {
          const checked = Array.from(options.querySelectorAll("input:checked")).map((checkbox) => checkbox.value).join("");
          state.exam.answers[item.id] = normalizeOptionAnswer(checked);
        } else {
          state.exam.answers[item.id] = option.key;
        }
      });
      const key = document.createElement("strong");
      key.textContent = option.key;
      const text = document.createElement("span");
      appendRichContent(text, option.text);
      label.append(input, key, text);
      if (exam.submitted) {
        if (multiResult) {
          applyMultiAnswerClasses(label, option.key, multiResult);
        } else {
          label.classList.toggle("correct", option.key === item.question.answer);
          label.classList.toggle("wrong", input.checked && !correct);
        }
      }
      options.appendChild(label);
    }
    card.appendChild(options);

    if (exam.submitted) {
      const panel = document.createElement("div");
      panel.className = "answer-panel show";
      panel.innerHTML = multiResult
        ? renderMultiAnswerFeedback(multiResult)
        : (correct
          ? `<strong>正确。</strong>答案：${escapeHtml(item.question.answer)}`
          : `<strong>错误。</strong>正确答案：${escapeHtml(item.question.answer)}`);
      card.appendChild(panel);
    }

    return card;
  }

  function submitMcuExam() {
    const exam = state.exam;
    const result = scoreMcuExam(exam);
    exam.submitted = true;
    exam.result = result;

    const subject = getActiveSubject();
    if (subject) {
      for (const item of exam.items) {
        if (!item.points || isSelfCheckedQuestion(item.question)) continue;
        if (isExamAnswerCorrect(item, exam.answers[item.id] || "")) {
          subject.wrongIds.delete(item.question.id);
        } else {
          subject.wrongIds.add(item.question.id);
        }
      }
    }

    render();
    scheduleSave();
  }

  function scoreMcuExam(exam) {
    let score = 0;
    let correctCount = 0;
    const total = exam.total ?? EXAM_STRATEGY.total;
    for (const item of exam.items) {
      if (!item.points) continue;
      if (isExamAnswerCorrect(item, exam.answers[item.id] || "")) {
        score += item.points;
        correctCount += 1;
      }
    }
    return { score, total, correctCount, questionCount: exam.items.length };
  }

  function isExamAnswerCorrect(item, answer) {
    if (isSelfCheckedQuestion(item.question)) return false;
    if (item.question.type === "multi") return evaluateMultiAnswer(answer, item.question.answer).status === "correct";
    return String(answer) === String(item.question.answer);
  }

  function renderQuestionScopeMeta(question) {
    return questionScopeParts(question).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }

  function questionScopeParts(question) {
    const parts = [];
    const chapter = normalizeQuestionContext(question && question.chapter ? question.chapter : "");
    const knowledgePoint = question ? question.knowledgePoint : null;
    const originNumber = question ? (question.originNumber ?? extractOriginalQuestionNumber(question.raw || "")) : null;
    const sourceName = String(question && question.sourceName ? question.sourceName : "").trim();
    const contextLabel = questionContextLabel(chapter);
    if (chapter) parts.push(`${contextLabel || "来源"} ${chapter}`);
    if (knowledgePoint !== null && knowledgePoint !== undefined && String(knowledgePoint).trim() !== "") {
      parts.push(`知识点 ${knowledgePoint}`);
    }
    if (originNumber !== null && originNumber !== undefined && String(originNumber).trim() !== "") {
      parts.push(`原题 ${originNumber}`);
    }
    if (sourceName) parts.push(`文件 ${sourceName}`);
    if (!parts.length) parts.push("来源 -");
    return parts;
  }

  function formatScore(value) {
    return Number(value).toFixed(1).replace(/\.0$/, "");
  }

  function filterQuestions(questions, type) {
    if (type === "all") return questions;
    return questions.filter((question) => question.type === type);
  }

  function getQuestionsByIds(ids) {
    const subject = getActiveSubject();
    if (!subject) return [];
    return subject.questions.filter((question) => ids.has(question.id));
  }

  function countTypes(questions) {
    return questions.reduce((acc, question) => {
      if (acc[question.type] !== undefined) acc[question.type] += 1;
      return acc;
    }, { single: 0, multi: 0, judge: 0, blank: 0, short: 0 });
  }

  function logImport(message, kind) {
    const item = document.createElement("div");
    item.className = `log-item ${kind || ""}`;
    item.textContent = message;
    els.importLog.prepend(item);
    while (els.importLog.children.length > 6) {
      els.importLog.lastElementChild.remove();
    }
  }

  function shuffleArray(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function appendRichContent(target, value) {
    const text = String(value ?? "");
    const pattern = /\[\[(IMG|TABLE):([\s\S]*?)\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        target.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      if (match[1] === "IMG") {
        const imageInfo = parseImagePayload(match[2]);
        if (!imageInfo) {
          lastIndex = pattern.lastIndex;
          continue;
        }
        const image = document.createElement("img");
        image.className = isMoveableQuestionVisual("IMG", match[2], true) ? "inline-formula inline-figure" : "inline-formula";
        image.src = imageInfo.src;
        if (imageInfo.width) image.dataset.width = String(imageInfo.width);
        if (imageInfo.height) image.dataset.height = String(imageInfo.height);
        image.alt = "公式或图片";
        image.loading = "lazy";
        image.addEventListener("click", () => showImagePreview(image.src));
        target.appendChild(image);
      } else if (match[1] === "TABLE") {
        target.appendChild(renderRichTable(match[2]));
      }
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      target.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderRichTable(payload) {
    const wrapper = document.createElement("span");
    wrapper.className = "inline-table-wrap";
    try {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const json = new TextDecoder("utf-8").decode(bytes);
      const rows = JSON.parse(json);
      const table = document.createElement("table");
      table.className = "inline-doc-table";
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((cell) => {
          const td = document.createElement("td");
          appendRichContent(td, cell);
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      wrapper.appendChild(table);
    } catch (error) {
      wrapper.textContent = "[表格]";
    }
    return wrapper;
  }

  function showImagePreview(src) {
    let overlay = document.querySelector(".image-preview-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "image-preview-overlay";
      overlay.innerHTML = `<button type="button" class="image-preview-close">关闭</button><img alt="图片预览">`;
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.classList.contains("image-preview-close")) {
          overlay.classList.remove("show");
        }
      });
      document.body.appendChild(overlay);
    }
    overlay.querySelector("img").src = src;
    overlay.classList.add("show");
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseQuestionText,
      normalizeText,
      assertReadableText,
      parseOptions,
      cleanQuestionStem,
      stripAnswerLeakBeforeOptions,
      parseImagePayload,
      withRichTokensProtected,
      hydrateState,
      normalizePracticeProgress,
      createMcuExam,
      createGenericExam,
      evaluateMultiAnswer,
      questionScopeParts,
      scoreMcuExam
    };
  }
})();

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
    judge: "判断"
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
      warnings: []
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
      els.serverHint.textContent = "当前是直接打开页面：doc 文件无法可靠读取，请用 python server.py 启动后导入。";
      els.serverHint.classList.add("warn");
    } else {
      els.serverHint.textContent = "当前已通过本地服务打开：doc/docx 均可导入。";
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
          logImport("请先生成单片机模拟卷。", "warn");
          return;
        }
        submitMcuExam();
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
    return { all: 0, single: 0, judge: 0 };
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
      practiceMode: ["all", "single", "judge"].includes(value.practiceMode) ? value.practiceMode : "all",
      practiceOrder: Array.isArray(value.practiceOrder) ? value.practiceOrder : [],
      practiceIndex: Number.isInteger(value.practiceIndex) && value.practiceIndex >= 0 ? value.practiceIndex : 0,
      previewFilter: ["all", "single", "judge"].includes(value.previewFilter) ? value.previewFilter : "all"
    };
  }

  function normalizeCachedQuestions(value) {
    if (!Array.isArray(value)) return [];
    return value.map((question) => ({
      ...question,
      knowledgePoint: question.knowledgePoint ?? extractKnowledgePoint(question.raw || "")
    }));
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
      if (!["docx", "doc"].includes(ext)) {
        logImport(`${file.name} 已跳过：仅支持 docx 和 doc。`, "warn");
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
          logImport(`${file.name} 未识别到单选题或判断题。`, "warn");
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

    throw new Error("仅支持 docx 和 doc。");
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
      if (!response.ok) return "";
      const payload = await response.json();
      if (payload && payload.ok && payload.text) {
        logImport(`已使用本地解析服务读取：${file.name}`, "ok");
        if (payload.warning) logImport(payload.warning, "warn");
        return payload.text;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function assertReadableText(text, fileName) {
    const sample = String(text || "").slice(0, 4000);
    const badChars = (sample.match(/[�\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
    const cjkChars = (sample.match(/[\u4e00-\u9fa5]/g) || []).length;
    const answerMarks = (sample.match(/答案：/g) || []).length;
    const embedMarks = (sample.match(/Office_|_123456|Times New Roman|System|MathType/g) || []).length;
    const badRatio = sample ? badChars / sample.length : 1;

    if (!sample.trim()) {
      throw new Error("未读取到有效文本。");
    }
    if (badRatio > 0.02 || (embedMarks >= 3 && cjkChars < 80 && answerMarks === 0)) {
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
        if (parsed) questions.push(parsed);
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
      .replace(/答案\s*[:：]/g, "答案：");

    return withRichTokensProtected(normalized, (value) => value
      .replace(/选项\s*([A-HＡ-Ｈ])\s*[）).．、:：]\s*/g, (_, key) => `${normalizeOptionKey(key)}. `)
      .replace(answerLeakBeforeOptionListPattern(), (_, open, close) => `${open} ${close}`)
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
    const pattern = /(?:^|\n)\s*(?:[一二三四五六七八九十]+|\d+)[、.．]\s*(单选题|单项选择题|选择题|判断题)[^\n]*/g;
    const matches = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        index: match.index,
        end: pattern.lastIndex,
        type: /判断/.test(match[1]) ? "judge" : "single"
      });
    }

    if (!matches.length) {
      return [{ type: "auto", content: text }];
    }

    return matches.map((item, index) => {
      const next = matches[index + 1];
      return {
        type: item.type,
        content: text.slice(item.end, next ? next.index : text.length).trim()
      };
    });
  }

  function splitQuestionBlocks(content, type) {
    const prepared = content
      .replace(/答案：\s*([A-H])(?=\s*(?:知识点|难度|(?:\d{1,3}\s*[、.．)])))/gi, "答案：$1\n")
      .replace(/答案：\s*(正确|错误|对|错|√|×)(?=\s*(?:知识点|难度|(?:\d{1,3}\s*[、.．)])))/g, "答案：$1\n");
    const lines = prepared
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (countQuestionStartLines(lines) >= 3) {
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

  function splitNumberedQuestionBlocks(lines, type) {
    const blocks = [];
    let buffer = [];
    let pendingVisual = [];

    for (const line of lines) {
      if (isQuestionStartLine(line)) {
        buffer = [line, ...pendingVisual];
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

  function parseBlock(block, type, sourceName) {
    if (isSuspiciousBlock(block)) return null;
    const answerMatch = block.match(/答案：\s*([\s\S]+)$/);
    if (!answerMatch) return null;

    const knowledgePoint = extractKnowledgePoint(block);
    const body = stripAnswerLeakBeforeOptions(cleanupStem(block.slice(0, answerMatch.index)));
    const rawAnswer = answerMatch[1].trim();
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
        raw: block
      };
    }

    if (parsedType === "single") {
      const options = parseOptions(body);
      const answer = normalizeOptionKey((rawAnswer.match(/[A-HＡ-Ｈ]/i) || [""])[0]);
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
        raw: block
      };
    }

    return null;
  }

  function inferType(body, rawAnswer, sourceName) {
    if (normalizeJudgeAnswer(rawAnswer)) return "judge";
    const hasChoiceAnswer = /^[A-HＡ-Ｈ]/i.test(rawAnswer.trim());
    if (hasChoiceAnswer && parseOptions(body).length >= 2) return "single";
    return "";
  }

  function extractKnowledgePoint(value) {
    const match = String(value || "").match(/知识点\s*[:：]\s*(\d+)/);
    return match ? Number(match[1]) : null;
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
      .replace(/[（(]\s*[A-DＡ-Ｄ]\s*[）)]\s*$/i, "（ ）")
      .replace(/[（(]\s*$/g, "（ ）")
      .replace(/[（(]\s*[）)]/g, "（ ）")
      .replace(/\s+/g, " ")
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
    if (/正确|对|√|true|t/i.test(value)) return "正确";
    if (/错误|错|×|false|f/i.test(value)) return "错误";
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
      ["判断", counts.judge],
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
      <span>${escapeHtml(question.sourceName || "")}</span>
    `;
    appendRichContent(card.querySelector("h3"), question.stem);

    const optionArea = card.querySelector(".options");
    const answerPanel = card.querySelector(".answer-panel");

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
    return card;
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
      question.options.forEach((item, optionIndex) => {
        if (optionIndex) options.appendChild(document.createTextNode("  "));
        const key = document.createElement("strong");
        key.textContent = `${item.key}. `;
        options.appendChild(key);
        appendRichContent(options, item.text);
      });
      const answer = document.createElement("p");
      answer.innerHTML = `<strong>答案：</strong>${escapeHtml(question.answer)}`;
      const source = document.createElement("p");
      source.innerHTML = `<strong>来源：</strong>${escapeHtml(question.sourceName || "导入文件")}`;
      card.append(type, stem, options, answer, source);
      list.appendChild(card);
    });
    container.appendChild(list);
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
      warnings
    };
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
    const resultText = exam.result
      ? `<p><strong>得分：${formatScore(exam.result.score)} / ${EXAM_STRATEGY.total}</strong>，已计分 ${formatScore(selectedTotal)} 分。</p>`
      : `<p>单片机固定策略：选择题 36 题 54 分（19-27 随机抽 8 个知识点），判断题 16 题 16 分，满分 70 分。</p>`;

    els.examSummary.innerHTML = `
      ${resultText}
      ${warningText}
    `;
    if (els.submitExamBtn) {
      els.submitExamBtn.disabled = !exam.items.length || exam.submitted;
    }

    els.examArea.innerHTML = "";
    if (!exam.items.length) {
      els.examArea.innerHTML = `<div class="blank-message">导入单片机单选和判断题库后，点击“生成模拟卷”。</div>`;
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
    const correct = exam.submitted ? isExamAnswerCorrect(item, selected) : false;
    const meta = document.createElement("div");
    meta.className = "question-meta";
    meta.innerHTML = `
      <span class="type-pill">${escapeHtml(typeLabels[item.type])}</span>
      <span>${escapeHtml(item.section)} ${number}</span>
      <span>${formatScore(item.points)} 分</span>
      <span>知识点 ${escapeHtml(item.question.knowledgePoint ?? "-")}</span>
    `;
    const stem = document.createElement("h3");
    appendRichContent(stem, item.question.stem);
    card.append(meta, stem);

    const options = document.createElement("div");
    options.className = "options exam-options";
    for (const option of item.question.options) {
      const label = document.createElement("label");
      label.className = "option-btn exam-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `exam-${item.id}`;
      input.value = option.key;
      input.checked = selected === option.key;
      input.disabled = exam.submitted;
      input.addEventListener("change", () => {
        state.exam.answers[item.id] = option.key;
      });
      const key = document.createElement("strong");
      key.textContent = option.key;
      const text = document.createElement("span");
      appendRichContent(text, option.text);
      label.append(input, key, text);
      if (exam.submitted) {
        label.classList.toggle("correct", option.key === item.question.answer);
        label.classList.toggle("wrong", selected === option.key && !correct);
      }
      options.appendChild(label);
    }
    card.appendChild(options);

    if (exam.submitted) {
      const panel = document.createElement("div");
      panel.className = "answer-panel show";
      panel.innerHTML = correct
        ? `<strong>正确。</strong>答案：${escapeHtml(item.question.answer)}`
        : `<strong>错误。</strong>正确答案：${escapeHtml(item.question.answer)}`;
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
    const total = EXAM_STRATEGY.total;
    for (const item of exam.items) {
      if (isExamAnswerCorrect(item, exam.answers[item.id] || "")) {
        score += item.points;
        correctCount += 1;
      }
    }
    return { score, total, correctCount, questionCount: exam.items.length };
  }

  function isExamAnswerCorrect(item, answer) {
    return String(answer) === String(item.question.answer);
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
    }, { single: 0, judge: 0 });
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
      parseOptions,
      cleanQuestionStem,
      stripAnswerLeakBeforeOptions,
      parseImagePayload,
      withRichTokensProtected,
      hydrateState,
      normalizePracticeProgress,
      createMcuExam,
      scoreMcuExam
    };
  }
})();

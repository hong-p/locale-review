import { useEffect, useMemo, useRef, useState } from "react";

type LocaleKey = "ko-KR" | "zh-CN" | "fr-FR" | "ja-JP" | "ar-SA";
type ColumnKey = "source" | "base" | "proposed";
type ReviewKind = "comment" | "approve" | "changes";

type Unit = {
  id: number;
  source: string;
  base: string;
  proposed: string;
  sourceLine: number;
  baseLine: number;
  proposedLine: number;
  change: "same" | "modified" | "added";
  warning?: string;
};

type Draft = { id: number; unitId: number; body: string; line: number };

const locales: Record<LocaleKey, { label: string; short: string; dir: "ltr" | "rtl"; units: Unit[] }> = {
  "ko-KR": {
    label: "한국어", short: "KO", dir: "ltr", units: [
      { id: 1, source: "Create a storage volume", base: "스토리지 볼륨 생성", proposed: "스토리지 볼륨 만들기", sourceLine: 14, baseLine: 14, proposedLine: 14, change: "modified" },
      { id: 2, source: "Volumes provide persistent block storage for your instances.", base: "볼륨은 인스턴스에 영구 블록 스토리지를 제공합니다.", proposed: "볼륨은 인스턴스에 영구적인 블록 스토리지를 제공합니다.", sourceLine: 16, baseLine: 16, proposedLine: 16, change: "modified" },
      { id: 3, source: "Volume name", base: "볼륨 이름", proposed: "볼륨 이름", sourceLine: 19, baseLine: 19, proposedLine: 19, change: "same" },
      { id: 4, source: "Availability zone", base: "가용 구역", proposed: "가용성 영역", sourceLine: 23, baseLine: 23, proposedLine: 23, change: "modified" },
      { id: 5, source: "Delete {volume_count} volumes?", base: "볼륨 {volume_count}개를 삭제하시겠습니까?", proposed: "선택한 볼륨을 삭제할까요?", sourceLine: 31, baseLine: 31, proposedLine: 31, change: "modified", warning: "플레이스홀더 {volume_count}가 번역에서 누락되었습니다." },
    ],
  },
  "zh-CN": {
    label: "简体中文", short: "ZH", dir: "ltr", units: [
      { id: 1, source: "Create a storage volume", base: "创建卷", proposed: "创建存储卷", sourceLine: 14, baseLine: 14, proposedLine: 14, change: "modified" },
      { id: 2, source: "Volumes provide persistent block storage for your instances.", base: "卷为实例提供持久块存储。", proposed: "存储卷为您的实例提供持久块存储。", sourceLine: 16, baseLine: 16, proposedLine: 16, change: "modified" },
      { id: 3, source: "Volume name", base: "卷名称", proposed: "存储卷名称", sourceLine: 19, baseLine: 19, proposedLine: 19, change: "modified" },
      { id: 4, source: "Availability zone", base: "可用区", proposed: "可用区", sourceLine: 23, baseLine: 23, proposedLine: 23, change: "same" },
      { id: 5, source: "Delete {volume_count} volumes?", base: "删除 {volume_count} 个卷？", proposed: "删除 {volume_count} 个存储卷？", sourceLine: 31, baseLine: 31, proposedLine: 31, change: "modified" },
    ],
  },
  "fr-FR": {
    label: "Français", short: "FR", dir: "ltr", units: [
      { id: 1, source: "Create a storage volume", base: "Créer un volume", proposed: "Créer un volume de stockage", sourceLine: 14, baseLine: 14, proposedLine: 14, change: "modified" },
      { id: 2, source: "Volumes provide persistent block storage for your instances.", base: "Les volumes fournissent un stockage persistant.", proposed: "Les volumes fournissent un stockage bloc persistant à vos instances.", sourceLine: 16, baseLine: 16, proposedLine: 16, change: "modified" },
      { id: 3, source: "Volume name", base: "Nom", proposed: "Nom du volume", sourceLine: 19, baseLine: 19, proposedLine: 19, change: "modified" },
      { id: 4, source: "Availability zone", base: "Zone de disponibilité", proposed: "Zone de disponibilité", sourceLine: 23, baseLine: 23, proposedLine: 23, change: "same" },
      { id: 5, source: "Delete {volume_count} volumes?", base: "Supprimer {volume_count} volumes ?", proposed: "Supprimer les {volume_count} volumes ?", sourceLine: 31, baseLine: 31, proposedLine: 31, change: "modified" },
    ],
  },
  "ja-JP": {
    label: "日本語", short: "JA", dir: "ltr", units: [
      { id: 1, source: "Create a storage volume", base: "ボリュームを作成", proposed: "ストレージボリュームを作成", sourceLine: 14, baseLine: 14, proposedLine: 14, change: "modified" },
      { id: 2, source: "Volumes provide persistent block storage for your instances.", base: "ボリュームは永続ストレージを提供します。", proposed: "ボリュームはインスタンス用の永続ブロックストレージを提供します。", sourceLine: 16, baseLine: 16, proposedLine: 16, change: "modified" },
      { id: 3, source: "Volume name", base: "ボリューム名", proposed: "ボリューム名", sourceLine: 19, baseLine: 19, proposedLine: 19, change: "same" },
      { id: 4, source: "Availability zone", base: "可用性ゾーン", proposed: "アベイラビリティゾーン", sourceLine: 23, baseLine: 23, proposedLine: 23, change: "modified" },
      { id: 5, source: "Delete {volume_count} volumes?", base: "{volume_count} 個のボリュームを削除しますか？", proposed: "{volume_count} 個のボリュームを削除しますか？", sourceLine: 31, baseLine: 31, proposedLine: 31, change: "same" },
    ],
  },
  "ar-SA": {
    label: "العربية", short: "AR", dir: "rtl", units: [
      { id: 1, source: "Create a storage volume", base: "إنشاء وحدة تخزين", proposed: "إنشاء وحدة تخزين دائمة", sourceLine: 14, baseLine: 14, proposedLine: 14, change: "modified" },
      { id: 2, source: "Volumes provide persistent block storage for your instances.", base: "توفر وحدات التخزين تخزينًا دائمًا.", proposed: "توفر وحدات التخزين تخزين كتل دائمًا لمثيلاتك.", sourceLine: 16, baseLine: 16, proposedLine: 16, change: "modified" },
      { id: 3, source: "Volume name", base: "اسم وحدة التخزين", proposed: "اسم وحدة التخزين", sourceLine: 19, baseLine: 19, proposedLine: 19, change: "same" },
      { id: 4, source: "Availability zone", base: "منطقة التوفر", proposed: "نطاق التوفر", sourceLine: 23, baseLine: 23, proposedLine: 23, change: "modified" },
      { id: 5, source: "Delete {volume_count} volumes?", base: "هل تريد حذف {volume_count} وحدات تخزين؟", proposed: "حذف {volume_count} من وحدات التخزين؟", sourceLine: 31, baseLine: 31, proposedLine: 31, change: "modified" },
    ],
  },
};

const files = [
  { name: "volume.json", path: "locales/{locale}/compute", add: 8, del: 5, comments: 2, state: "active" },
  { name: "snapshot.json", path: "locales/{locale}/compute", add: 4, del: 2, comments: 0, state: "open" },
  { name: "network.json", path: "locales/{locale}", add: 3, del: 3, comments: 1, state: "open" },
  { name: "dashboard.json", path: "locales/{locale}", add: 12, del: 8, comments: 0, state: "done" },
];

export default function Home() {
  const [locale, setLocale] = useState<LocaleKey>("ko-KR");
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({ source: true, base: true, proposed: true });
  const [changesOnly, setChangesOnly] = useState(false);
  const [sync, setSync] = useState(true);
  const [activeComment, setActiveComment] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewKind, setReviewKind] = useState<ReviewKind>("comment");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [token, setToken] = useState("");
  const [toast, setToast] = useState("");
  const panels = useRef<Record<string, HTMLDivElement | null>>({});
  const locking = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem("locale-review-settings");
    const savedDrafts = localStorage.getItem("locale-review-drafts");
    if (raw) {
      const value = JSON.parse(raw);
      if (value.locale) setLocale(value.locale);
      if (value.visible) setVisible(value.visible);
      if (typeof value.sync === "boolean") setSync(value.sync);
      if (value.token) setToken(value.token);
    }
    if (savedDrafts) setDrafts(JSON.parse(savedDrafts));
  }, []);

  useEffect(() => {
    localStorage.setItem("locale-review-settings", JSON.stringify({ locale, visible, sync, token }));
  }, [locale, visible, sync, token]);
  useEffect(() => localStorage.setItem("locale-review-drafts", JSON.stringify(drafts)), [drafts]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  const current = locales[locale];
  const units = useMemo(() => current.units.filter((u) => !changesOnly || u.change !== "same"), [current, changesOnly]);
  const columnCount = Object.values(visible).filter(Boolean).length;

  const toggleColumn = (key: ColumnKey) => {
    if (visible[key] && columnCount === 1) return;
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  };
  const syncScroll = (origin: string, top: number) => {
    if (!sync || locking.current) return;
    locking.current = true;
    Object.entries(panels.current).forEach(([key, el]) => { if (key !== origin && el) el.scrollTop = top; });
    requestAnimationFrame(() => { locking.current = false; });
  };
  const saveDraft = (unit: Unit, immediate: boolean) => {
    if (!commentText.trim()) return;
    if (immediate) showToast(`라인 ${unit.proposedLine} 댓글을 등록했습니다 (데모)`);
    else {
      setDrafts((items) => [...items, { id: Date.now(), unitId: unit.id, body: commentText.trim(), line: unit.proposedLine }]);
      showToast("Pending review에 추가했습니다");
    }
    setCommentText(""); setActiveComment(null);
  };
  const submitReview = () => {
    if (!drafts.length && !reviewBody.trim()) return;
    showToast(`${drafts.length}개 댓글을 ${reviewKind === "approve" ? "승인" : reviewKind === "changes" ? "변경 요청" : "의견"}으로 제출했습니다 (데모)`);
    setDrafts([]); setReviewBody("");
  };

  const renderPanel = (key: ColumnKey, title: string, localeLabel: string) => visible[key] && (
    <section className="review-panel" aria-label={title}>
      <header className="panel-header"><div><span className={`column-dot ${key}`} />{title}</div><span>{localeLabel}</span></header>
      <div className="lines" ref={(el) => { panels.current[key] = el; }} onScroll={(e) => syncScroll(key, e.currentTarget.scrollTop)}>
        {units.map((unit) => {
          const text = unit[key];
          const line = key === "source" ? unit.sourceLine : key === "base" ? unit.baseLine : unit.proposedLine;
          const changed = unit.change !== "same" && key !== "source";
          const marker = changed ? (key === "base" ? "−" : "+") : "";
          return <div className={`line-block ${changed ? key === "base" ? "removed" : "added" : ""}`} key={unit.id}>
            <div className="line-row">
              <span className="line-number">{line}</span><span className="marker">{marker}</span>
              <span className="line-copy" dir={key === "source" ? "ltr" : current.dir}>{text}</span>
              {key === "proposed" && changed && <button className="add-comment" onClick={() => { setActiveComment(unit.id); setCommentText(""); }} aria-label={`${line}번 줄에 댓글 추가`}>＋</button>}
            </div>
            {key === "proposed" && unit.warning && <div className="warning">⚠ {unit.warning}</div>}
            {key === "proposed" && activeComment === unit.id && <div className="comment-editor">
              <textarea autoFocus value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="이 변경에 대한 의견을 남겨주세요…" />
              <div className="comment-actions"><button className="ghost" onClick={() => setActiveComment(null)}>취소</button><button className="secondary" onClick={() => saveDraft(unit, true)}>즉시 등록</button><button className="primary" onClick={() => saveDraft(unit, false)}>리뷰에 추가</button></div>
            </div>}
            {key === "proposed" && drafts.filter((d) => d.unitId === unit.id).map((draft) => <div className="draft-chip" key={draft.id}><span>초안</span>{draft.body}<button onClick={() => setDrafts((all) => all.filter((d) => d.id !== draft.id))}>×</button></div>)}
          </div>;
        })}
      </div>
    </section>
  );

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">L</div><div><strong>Locale Review</strong><span>Translation pull request</span></div></div>
      <div className="repo"><span className="repo-icon">⌘</span><div><small>REPOSITORY</small><strong>acme / cloud-console</strong></div><span className="pr-badge">PR #248</span></div>
      <div className="top-actions"><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="설정">⚙</button><button className="submit-top" onClick={() => document.getElementById("review-box")?.scrollIntoView({ behavior: "smooth" })}>리뷰 제출 <b>{drafts.length}</b></button></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="side-title"><div><span>CHANGED FILES</span><b>4</b></div><button>‹</button></div>
        <label className="search"><span>⌕</span><input placeholder="파일 검색" /></label>
        <div className="tree-title"><span>⌄</span> locales / <b>{locale}</b></div>
        <nav>{files.map((file) => <button className={`file ${file.state}`} key={file.name}>
          <span className="file-status">{file.state === "done" ? "✓" : "•"}</span><span className="file-main"><strong>{file.name}</strong><small>{file.path.replace("{locale}", locale)}</small></span><span className="file-stats"><i>+{file.add}</i><em>−{file.del}</em>{file.comments > 0 && <b>◉ {file.comments}</b>}</span>
        </button>)}</nav>
        <div className="progress"><div><span>검토 진행률</span><b>1 / 4</b></div><div className="progress-track"><i /></div><small>dashboard.json 검토 완료</small></div>
      </aside>

      <section className="content">
        <div className="contextbar">
          <div className="file-heading"><div className="file-icon">{ }</div><div><strong>volume.json</strong><span>locales/{locale}/compute/volume.json</span></div></div>
          <div className="locale-select"><span>대상 언어</span><select value={locale} onChange={(e) => setLocale(e.target.value as LocaleKey)}>{Object.entries(locales).map(([key, item]) => <option value={key} key={key}>{item.short} · {item.label}</option>)}</select></div>
        </div>
        <div className="toolbar">
          <div className="column-toggles">{(["source", "base", "proposed"] as ColumnKey[]).map((key) => <button key={key} className={visible[key] ? "on" : ""} onClick={() => toggleColumn(key)}><span>{visible[key] ? "✓" : ""}</span>{key === "source" ? "원본" : key === "base" ? "변경 전" : "변경 후"}</button>)}</div>
          <div className="view-toggles"><label><input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} /> 변경 부분만</label><label><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} /> 스크롤 동기화</label></div>
          <div className="change-nav"><button onClick={() => panels.current.proposed?.scrollBy({ top: -120, behavior: "smooth" })}>↑</button><span>변경 <b>1</b> / 4</span><button onClick={() => panels.current.proposed?.scrollBy({ top: 120, behavior: "smooth" })}>↓</button></div>
        </div>
        <div className="review-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(280px, 1fr))` }}>
          {renderPanel("source", "원본", "en-US")}{renderPanel("base", "변경 전", locale)}{renderPanel("proposed", "변경 후", locale)}
        </div>
        <section className="review-box" id="review-box">
          <div className="review-box-head"><div><span className="avatar">HP</span><div><strong>리뷰 제출</strong><small>{drafts.length}개의 인라인 댓글이 대기 중입니다</small></div></div><span className="pending-count">{drafts.length} PENDING</span></div>
          <textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="전체 리뷰 의견을 남겨주세요…" />
          <div className="review-footer"><div className="review-types"><label><input type="radio" name="review" checked={reviewKind === "comment"} onChange={() => setReviewKind("comment")} /><span><b>Comment</b><small>일반적인 의견을 남깁니다</small></span></label><label><input type="radio" name="review" checked={reviewKind === "approve"} onChange={() => setReviewKind("approve")} /><span><b>Approve</b><small>변경 사항을 승인합니다</small></span></label><label><input type="radio" name="review" checked={reviewKind === "changes"} onChange={() => setReviewKind("changes")} /><span><b>Request changes</b><small>수정이 필요합니다</small></span></label></div><button className="primary big" onClick={submitReview}>리뷰 제출 ({drafts.length})</button></div>
        </section>
      </section>
    </div>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="settings-modal" onMouseDown={(e) => e.stopPropagation()}><header><div><strong>프로젝트 설정</strong><span>이 기기의 브라우저에만 저장됩니다.</span></div><button onClick={() => setSettingsOpen(false)}>×</button></header><div className="settings-grid"><label>GitHub API URL<input defaultValue="https://api.github.com" /></label><label>저장소<input defaultValue="acme/cloud-console" /></label><label>기본 브랜치<input defaultValue="main" /></label><label>원본 locale<input defaultValue="en-US" /></label><label className="wide">대상 경로 패턴<input defaultValue="locales/{locale}/**/*.json" /></label><label className="wide">Fine-grained token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_••••••••" /><small>프로토타입에서는 localStorage에 저장됩니다. 실제 운영에서는 짧은 만료와 최소 권한을 권장합니다.</small></label></div><footer><button className="ghost" onClick={() => setSettingsOpen(false)}>취소</button><button className="primary" onClick={() => { setSettingsOpen(false); showToast("설정을 저장했습니다"); }}>저장</button></footer></section></div>}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}

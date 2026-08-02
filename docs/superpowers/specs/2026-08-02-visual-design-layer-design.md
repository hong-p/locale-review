# 시각 디자인 계층 설계

작성일: 2026-08-02

## 문제

기능 구현은 끝났지만 **14개 컴포넌트에 스타일이 없다.** CSS Module은 `DiffPanel`과 `ThreeColumnDiff` 둘뿐이고, 나머지는 브라우저 기본 스타일의 맨 HTML이다.

`tokens.css`와 `theme.css`에 색·간격·radius·타이포·그림자·모션 토큰이 모두 정의돼 있으나 diff 패널 외에는 아무도 쓰지 않는다. 토큰만 있고 적용이 없다.

테스트 587개가 통과하는 이유는 role과 label로 요소를 찾기 때문이다. 스타일 부재는 테스트로 드러나지 않는다.

## 목표

plan.md §7이 요구하는 GitHub `Files changed`에 가까운 화면. §3.7의 제약(CSS custom properties + CSS Modules, Tailwind·CSS-in-JS 금지)을 유지한다.

## 결정

### 1. 전체 높이 앱 셸

헤더와 사이드바를 고정하고 diff 영역이 남은 높이를 채운다. 패널의 `max-height: 60vh`를 제거한다.

근거: 3열을 볼 때 페이지 스크롤과 패널 스크롤이 섞이지 않는다. 비율 기반 스크롤 동기화(plan.md §4.6)도 패널이 고정 높이를 가질 때 자연스럽다.

**안전장치**: diff 영역에 `min-height: 320px`를 둔다. 짧은 화면에서 남는 공간이 그보다 작아지면 페이지 자체가 스크롤된다. 없으면 13인치에서 diff가 서너 줄만 보인다.

### 2. 댓글을 diff 행 모델에 삽입

```ts
type PanelRow = {
  line: DiffLine;
  counterpart: string | null;
  precedingGap: number | null;
  threads: CommentThread[];  // 추가
  canComment: boolean;       // 추가 — GitHub patch hunk 기준
};
```

`buildDiffRows`가 `(side, line)`으로 스레드를 매칭하고 `DiffPanel`이 라인 행 뒤에 댓글 블록을 렌더링한다.

**`collapseToChanges`는 댓글이 있는 행을 무조건 유지한다.** 이 규칙이 없으면 `Changes only`에서 댓글이 사라진다.

`line`이 null인 outdated 댓글은 라인에 붙일 수 없으므로 패널 상단에 별도로 묶는다.

기각한 대안:
- **절대 위치 오버레이** — 리사이즈·줄바꿈·RTL에서 어긋나고 접근성이 무너진다
- **별도 댓글 열** — GitHub과 다르고 정렬이 근사치이며 3열에서 폭을 더 뺏는다

### 3. 인라인 댓글 작성

지금 `postNow`와 `addToPending`은 훅에 구현돼 있으나 **아무 데서도 호출하지 않는다.** 라인 연결과 함께 도달 가능하게 만든다.

- 댓글 가능한 라인에만 `+` 버튼. 판정은 `isCommentable`, 즉 GitHub patch hunk 기준(plan.md §4.9)
- 클릭하면 그 자리에 textarea와 `즉시 등록` / `리뷰에 추가` / `취소`
- 읽기 전용이면 `+` 자체를 렌더링하지 않는다
- 실패해도 입력 내용을 유지한다(plan.md §4.9)

### 4. 리뷰 제출은 헤더 팝오버

전체 높이 셸에서는 "페이지 맨 아래"가 존재하지 않는다. 헤더의 `Review changes (N)` 버튼이 `<dialog>` 팝오버를 연다. 네이티브 focus trap과 Esc 닫기를 얻는다. 내용은 기존 `ReviewSummaryBox`를 그대로 옮긴다.

### 5. CSS Module 12개

`AppShell`, `StartScreen`, `PullRequestHeader`, `TokenPanel`, `FileSidebar`, `FileHeader`,
`CommentThread`, `CommentComposer`, `ReviewPopover`, `ViewedToggle`, `RefreshBanner`, `Button`.

새 색을 만들지 않는다. 부족하면 `tokens.css`에 추가하고 다크 대응을 같이 넣는다.

## 반응형

900px 미만에서 사이드바가 접히고(토글 버튼) 패널 1개만 표시한다. 기존 미디어 쿼리 분기를 재사용한다.

## 테스트 영향

- 스타일만으로 깨지는 테스트는 없다. role과 label로 찾기 때문이다.
- 깨질 것: `buildDiffRows` 시그니처 변경 → `buildPanelRows.test.ts`, `ThreeColumnDiff.test.tsx`
- 추가할 것: 라인 연결 배치, 압축 보기에서 댓글 생존, 인라인 작성 두 경로, 팝오버 열림·닫힘
- e2e 추가: 라인에 댓글이 보이는지, `+`로 작성되는지, 팝오버로 제출되는지

## 비범위

- 시각 회귀 스크린샷 비교(plan.md §9) — 별도 작업
- Markdown 렌더링 미리보기 — plan.md §11 비범위

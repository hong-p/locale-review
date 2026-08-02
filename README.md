# Locale Review

번역 Pull Request를 **원문 / 변경 전 번역 / 변경 후 번역** 3열로 나란히 놓고 검토하는 웹앱입니다.

**바로 사용하기 → <https://hong-p.github.io/locale-review/>**

GitHub의 기본 diff는 "무엇이 바뀌었는지"는 보여주지만 "무엇을 번역한 것인지"는 보여주지 않습니다. 번역 리뷰어는 변경된 한국어 문장이 영어 원문을 제대로 옮긴 것인지 확인해야 하는데, 그러려면 매번 다른 탭에서 원문 파일을 찾아 눈으로 대조해야 합니다. Locale Review는 그 원문 파일을 자동으로 찾아 diff 옆에 함께 띄웁니다.

리뷰 결과(라인 댓글, 답글, Viewed 표시, Approve/Request changes)는 **실제 GitHub PR에 그대로 반영**됩니다. 별도의 리뷰 저장소를 만들지 않습니다.

---

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 3열 뷰어 | 원문 / 변경 전 / 변경 후를 각각 독립된 줄번호로 전체 파일 표시 |
| 원문 자동 탐색 | 번역 파일 경로 규칙으로 대응되는 원문 파일 경로를 계산해 함께 조회 |
| 번역 파일 감지 | PR의 변경 파일 중 번역 파일만 골라내고 locale을 자동 인식 |
| locale 필터 | PR에 포함된 언어 목록과 파일 수를 보여주고, 검토할 언어만 선택 |
| 단어 단위 diff | 줄 단위 diff 위에 단어/grapheme 단위 강조를 얹어 미세한 수정도 표시 |
| Changes only | 변경된 부분만 접어서 보기 |
| 기존 리뷰 대화 | PR에 이미 달린 인라인 댓글과 전체 리뷰를 해당 줄에 붙여 표시, 답글 작성 |
| 댓글 작성 | 라인/범위 선택 후 즉시 등록하거나 pending 리뷰에 모아두기 |
| 리뷰 제출 | Comment / Approve / Request changes 제출 |
| Viewed | GitHub의 파일별 Viewed 상태 확인 및 변경 |
| 새로고침 보호 | PR에 새 커밋이 생기면 배너로 알리고, 작성 중인 글은 임의로 버리지 않음 |
| Light / Dark | 시스템 설정 자동 추종 + 수동 전환 |
| RTL 지원 | 번역 본문과 그 댓글 입력 영역만 locale 방향에 따라 RTL 적용 |

---

## 동작 방식

```
브라우저 (정적 파일)  ──HTTPS──>  api.github.com
   React SPA                        REST + GraphQL
   토큰: 브라우저 저장소
```

- **서버가 없습니다.** 백엔드, 데이터베이스, 프록시, 런타임 API가 전혀 없습니다.
- 브라우저가 사용자의 GitHub 토큰으로 GitHub API를 **직접** 호출합니다.
- 빌드 결과물은 정적 파일이므로 GitHub Pages 같은 정적 호스팅에 그대로 올릴 수 있습니다.
- 토큰은 사용자의 브라우저 밖으로 나가지 않습니다. CSP의 `connect-src`가 `api.github.com` 하나만 허용합니다.

---

## 기술 스펙

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 언어 | TypeScript 5.9 | `strict` |
| UI | React 19 | |
| 빌드 | Vite 8 | `base: "./"` — 저장소 하위 경로에서도 동작 |
| 라우팅 | React Router 8 `HashRouter` | 서버 rewrite 없이 직접 링크/새로고침 가능 |
| 서버 상태 | TanStack Query 5 | lazy fetch, 요청 취소, 캐시 무효화. mutation은 자동 retry 없음 |
| 앱 상태 | React Context + `useState` | 별도 전역 상태 라이브러리 없음 |
| GitHub API | 직접 만든 `fetch` wrapper | Octokit 미사용. REST/GraphQL, pagination, rate limit을 공통 오류 모델로 변환 |
| Diff | `diff` 패키지 + 자체 계층 | 줄 단위 diff, intra-line diff, GitHub 댓글 위치 매핑 |
| Markdown 안전 처리 | DOMPurify | GitHub이 렌더한 댓글 HTML을 sanitize 후 표시 |
| 아이콘 | lucide-react | |
| 스타일 | CSS Modules + CSS 변수 | UI 프레임워크 없음. `tokens.css` 한 곳에서 색/간격 정의 |
| 검증 | 자체 type guard | Zod 등 런타임 스키마 패키지 없음 |
| 저장소 | `localStorage` / `sessionStorage` | schema version이 붙은 envelope, 손상 시 해당 항목만 폐기 |
| 린트/포맷 | Biome 2 | |
| 단위/컴포넌트 테스트 | Vitest + Testing Library + MSW | |
| 브라우저 테스트 | Playwright | Chromium / Firefox / WebKit / Pixel 7 / iPhone 14 |
| CI/배포 | GitHub Actions → GitHub Pages | |

빌드 산출물 크기(현재): JS 392 kB (gzip 125 kB), CSS 28 kB (gzip 5 kB).

---

## 시작하기

### 요구 사항

- Node.js **22.22.0 이상** (`package.json`의 `engines`)
- GitHub 계정과 **classic** Personal Access Token

### 설치와 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

### 1단계 — GitHub 토큰 만들기

앱은 인증 없는 요청을 보내지 않습니다. 토큰이 없으면 PR URL을 입력해도 조회를 시작하지 않습니다.

1. <https://github.com/settings/tokens/new?scopes=public_repo> 에서 **classic** 토큰을 만듭니다.
2. 스코프는 `public_repo`를 선택합니다. 비공개 저장소도 검토한다면 `repo`를 선택합니다.
3. 만료 기간은 짧게 잡습니다.
4. 시작 화면의 `GitHub token` 패널에 붙여넣고 `Save token`을 누릅니다.
5. `Test connection`으로 GitHub이 토큰을 받아들이는지 확인합니다.

> **fine-grained 토큰은 사용할 수 없습니다.** GitHub은 본인 소유가 아닌 공개 저장소에 대해 fine-grained 토큰을 항상 읽기 전용으로 취급합니다. PR을 볼 수는 있지만 댓글·리뷰·Viewed가 모두 거부됩니다. 남의 번역 PR을 검토하는 것이 이 앱의 목적이므로 classic 토큰이 필요합니다.

토큰은 기본적으로 **현재 탭의 `sessionStorage`에만** 저장됩니다. `Remember token on this device`를 켠 경우에만 `localStorage`에 남습니다. 공용 컴퓨터에서는 켜지 마세요.

### 2단계 — 번역 파일 경로 설정

시작 화면 우측 상단의 `Settings`에서 **어떤 파일이 번역 파일인지, 그 원문이 어디에 있는지**를 정합니다. 저장소마다 규칙이 다르므로 이 설정이 맞아야 원문 패널이 채워집니다.

| 설정 | 의미 | 기본값 |
| --- | --- | --- |
| Layouts to detect | 사용할 경로 규칙(아래 참고). 둘 다 켤 수 있음 | Locale directory |
| Source locale | 원문 언어. 이 언어 파일은 번역 대상이 아니라 원문으로 취급 | `en` |
| Content root | 번역 파일이 들어 있는 디렉터리. 비우면 저장소 전체 | `content` |
| File extensions | 대상 확장자. 쉼표로 구분하며 점은 자동으로 붙음 | `.md` |
| Source files carry the locale suffix | 접미사형에서 원문 파일이 locale 접미사를 갖는지 | 켬 |
| Preferred locales | PR을 열 때 자동 선택할 언어. 목록에 넣은 값은 언어 코드로 인정됨 | `ko` |

두 가지 경로 규칙을 지원합니다.

- **Locale directory** — `content/ko/guide.md` → 원문 `content/en/guide.md`
- **Filename suffix** — `content/guide.ko.md` → 원문 `content/guide.en.md`
  (`Source files carry the locale suffix`를 끄면 Hugo 기본 언어 방식인 `content/guide.md`를 찾습니다.)

설정 화면 아래쪽의 **Where the source is looked up** 상자가 현재 입력값으로 만들어지는 경로 쌍을 실시간으로 보여줍니다. PR을 열기 전에 여기서 원문 경로가 맞는지 확인할 수 있습니다.

임의의 정규식이나 glob 규칙은 지원하지 않습니다. 위 두 규칙에 해당하지 않는 저장소 구조는 1차 버전 범위 밖입니다.

### 3단계 — PR 열기

시작 화면에 PR URL을 붙여넣고 `Open pull request`를 누릅니다.

```
https://github.com/owner/repository/pull/123
```

주소창은 `#/github/owner/repository/pull/123` 형태가 되며, 이 링크를 그대로 공유하거나 북마크할 수 있습니다.

변경 파일 중 번역 파일이 하나도 감지되지 않으면 현재 적용 중인 규칙을 화면에 표시하고 설정으로 가는 링크와 재시도 버튼을 제공합니다.

### 4단계 — 검토하기

- 상단 스트립에서 파일을 고르고(`‹` `›`로 이동), 검토할 locale을 체크합니다.
- 세 패널을 비교합니다. `Changes only`, `Sync scrolling`, `Find in panels`, 변경 위치 이동 버튼을 사용할 수 있습니다.
- 좁은 화면에서는 세 열을 억지로 줄이지 않고 `Show panel`로 하나씩 전환합니다.
- After 패널의 `+` 열을 클릭하면 그 줄에 댓글을 답니다. `+`를 아래로 드래그하거나 shift-클릭하면 여러 줄 범위가 됩니다.
- `Comment now`는 즉시 등록, `Add to review`는 pending 리뷰에 모아둡니다.
- 파일을 다 봤으면 `Viewed`를 켭니다. GitHub의 Viewed 상태가 실제로 바뀝니다.
- 헤더의 `Review changes`에서 요약을 쓰고 Comment / Approve / Request changes를 제출합니다. 선택하지 않은 locale이 PR에 남아 있으면 경고가 표시됩니다.

---

## 저장되는 데이터

모두 사용자의 브라우저에만 저장되며, 각 항목에는 schema version이 붙습니다. 읽을 수 없는 값은 해당 항목만 버리고 기본값으로 되돌립니다.

**`localStorage`**

- `locale-review.theme` — 테마 선택
- `locale-review.translation-settings` — 번역 레이아웃, 원문 locale, 선호 locale
- `locale-review.token` — `Remember`를 켠 경우에만

**`sessionStorage`** (탭을 닫으면 사라짐)

- `locale-review.token` — 기본 토큰 저장 위치
- PR별 미전송 댓글/리뷰 초안

토큰은 브라우저 origin별로 따로 저장됩니다. 로컬 개발 서버와 배포된 주소는 서로 다른 토큰을 가집니다. 최근 PR 기록은 저장하지 않으며, 외부 분석 도구·광고·원격 스크립트를 사용하지 않습니다.

프로토타입을 실행했던 브라우저에는 `locale-review-settings`에 평문 토큰이 남아 있을 수 있습니다. 앱을 처음 실행할 때 이 항목을 자동으로 삭제합니다.

---

## 개발

### 소스 구조

```text
src/
  app/          진입점, 라우터, provider, 오류 경계, 화면
  api/          GitHub REST/GraphQL wrapper, pagination, 오류 모델
  features/
    auth/       토큰 저장, 연결 테스트, 권한 확인
    pull/       PR URL 파싱, 메타데이터, 새 변경 감지
    locales/    locale 필터, 문자 방향
    files/      변경 파일 목록, 3버전 파일 모델, lazy 내용 조회
    diff/       patch 파싱, line/intra-line diff, 3열 뷰어
    comments/   기존 댓글, 답글, 즉시 댓글, pending review, 리뷰 제출
    viewed/     GraphQL Viewed 상태
    settings/   테마, 번역 레이아웃 설정
  storage/      version이 붙은 브라우저 저장소 adapter
  styles/       토큰, reset, theme
  test/         fixture, MSW handler
e2e/            Playwright 브라우저 테스트
```

### 스크립트

```bash
npm run dev          # 개발 서버
npm run build        # dist/ 생성
npm run preview      # 빌드 결과 확인
npm run verify       # typecheck + lint + format 검사 + 단위 테스트 + 빌드
npm run test         # Vitest 1회 실행
npm run test:watch   # Vitest watch
npm run test:e2e     # Playwright (빌드된 결과물 대상)
```

브라우저 테스트는 처음 한 번 바이너리 설치가 필요합니다.

```bash
npx playwright install --with-deps chromium firefox webkit
```

### 코드 규칙

- 코드와 화면 문구는 **영어**, 계획·협업 문서는 **한국어**를 사용합니다.
- 화면 문구는 전부 `src/messages/en.ts`에 모읍니다.
- 경로 매핑, patch 파싱, diff 계산, 저장소 parser는 React에 의존하지 않는 순수 함수로 작성합니다.
- 기능을 추가할 때 관련 단위/컴포넌트 테스트와 브라우저 흐름 테스트를 함께 추가합니다.

### 배포

`main`에 push하면 `.github/workflows/deploy.yml`이 품질 게이트를 통과한 뒤 `dist/`를 GitHub Pages에 배포합니다. 상대 경로 자산과 hash 라우팅을 쓰므로 저장소 하위 경로에서도 그대로 동작합니다. 저장소에서 한 번만 해두어야 하는 Pages 설정은 [docs/deployment.md](./docs/deployment.md)에 있습니다.

---

## 문서

- [result.md](./result.md) — 현재 구현 상태, plan.md 대비 구현/미구현 목록, 검증 결과
- [plan.md](./plan.md) — 제품 범위, 기술 결정, 단계별 구현 계획
- [docs/testing.md](./docs/testing.md) — 테스트 계층과 실제 GitHub 쓰기 검증 절차
- [docs/deployment.md](./docs/deployment.md) — GitHub Pages 설정, CSP 한계, 토큰 저장의 실제 위험

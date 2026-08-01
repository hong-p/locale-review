# Locale Review 구현 계획

## 1. 제품 목표

국제화 작업에 특화된 GitHub Pull Request 리뷰 웹앱을 만든다. GitHub와 익숙한 리뷰 흐름을 유지하면서 원문, 기존 번역문, 제안 번역문을 3열로 비교할 수 있어야 한다.

첫 번째 버전은 `github.com`만 지원한다. 별도 서버나 데이터베이스 없이 브라우저에서만 실행되는 정적 SPA로 만들며 GitHub Pages에 배포할 수 있어야 한다.

## 2. 확정된 제품 방향

- 시작 화면에는 PR URL 입력란만 표시하며 최근 PR 목록은 제공하지 않는다.
- `https://github.com/owner/repository/pull/123` 형식의 URL로 PR을 연다.
- PR을 열면 `/#/owner/repository/pull/123` 형태의 공유 가능한 hash 경로로 이동한다.
- 해당 경로를 새로고침하거나 직접 열면 같은 PR을 복원한다. 사이트 루트로 접속하면 빈 시작 화면을 표시한다.
- 1차 버전 UI는 영어로 제공하고 GitHub 영문판의 용어를 사용한다.
- 향후 UI 번역을 추가할 수 있도록 사용자 문구는 별도 메시지 모듈로 분리한다.
- 전체 정보 구조와 상호작용은 GitHub의 `Files changed` 화면과 가깝게 구성한다.
- 원문 / 변경 전 / 변경 후 3열 구조는 이 제품의 핵심 기능으로 유지한다.
- Light / Dark / System 테마를 제공한다. 기본값은 System이며 사용자의 선택을 저장한다.
- GitHub Enterprise Server 지원은 후속 범위로 미룬다.

## 3. 기술 스택과 구현 원칙

### 3.1 애플리케이션 기반

- React 19와 TypeScript를 유지한다.
- 빌드 및 개발 서버는 Vite를 사용한다.
- 서버 렌더링이나 서버 전용 기능이 필요하지 않으므로 Next.js 같은 서버 중심 프레임워크로 전환하지 않는다.
- 브라우저 전용 정적 SPA로 빌드하며 GitHub Pages의 저장소 하위 경로에서도 동작하게 한다.
- TypeScript는 strict 모드를 유지하고 API 응답, 저장 데이터, diff 모델에 명시적인 타입을 사용한다.

### 3.2 상태 관리

- GitHub 서버 데이터와 API 요청 상태는 TanStack Query로 관리한다.
- TanStack Query의 query key에는 owner, repository, PR 번호, merge base SHA, head SHA, 파일 경로 등 캐시 정합성에 필요한 값을 포함한다.
- 선택 파일 lazy fetch, 중복 요청 방지, 요청 취소, 로딩/오류 상태, 수동 갱신과 캐시 무효화에 TanStack Query를 사용한다.
- 댓글, 리뷰, Viewed 같은 mutation은 중복 실행 위험이 있으므로 자동 retry를 사용하지 않는다.
- 테마, 선택 패널, locale 필터 같은 앱 UI 상태는 React Context와 `useReducer`를 사용한다.
- textarea, 모달, hover처럼 컴포넌트에 국한된 상태는 `useState`를 사용한다.
- 토큰, 설정, 초안의 영속화는 별도 browser storage 모듈에서 담당한다.
- Redux나 Zustand 같은 추가 전역 상태 라이브러리는 1차 버전에서 사용하지 않는다.

### 3.3 라우팅

- React Router의 `HashRouter`를 사용한다.
- `/#/`는 토큰 및 PR URL 입력 시작 화면으로 사용한다.
- `/#/github/:owner/:repo/pull/:number`는 직접 열고 공유할 수 있는 PR 리뷰 화면으로 사용한다.
- 설정 화면은 hash route 또는 중첩 modal route로 정의해 뒤로가기 동작을 일관되게 유지한다.
- GitHub Pages가 서버 측 rewrite를 제공하지 않아도 직접 링크와 새로고침이 동작해야 한다.
- URL 파라미터는 라우터 진입 시 다시 검증하고 owner/repo/PR 번호를 정규화한다.
- 뒤로가기, 앞으로가기, 직접 hash 접근과 잘못된 경로를 단위 및 Playwright 테스트에 포함한다.

### 3.4 GitHub API 클라이언트

- Octokit은 사용하지 않고 브라우저 표준 `fetch`를 감싼 작은 타입 기반 API wrapper를 직접 구현한다.
- REST와 GraphQL 요청의 인증, API version, Accept 헤더, 오류 변환을 공통 처리한다.
- REST pagination은 `Link` 헤더를 해석하는 공통 유틸로 구현한다.
- `x-ratelimit-*`, `retry-after` 헤더를 내부 오류 모델로 변환한다.
- JSON과 raw content 응답을 명시적으로 분리한다.
- `AbortController`로 PR 및 파일 전환 시 불필요한 조회를 취소한다.
- mutation은 자동 재시도하지 않는다.
- GitHub 응답 전체를 앱에 전달하지 않고 사용하는 필드만 내부 타입으로 변환한다.
- API wrapper는 MSW를 사용해 pagination, 권한, rate limit, raw 응답, GraphQL 오류를 집중 테스트한다.

### 3.5 Diff 구현

- 라인 및 줄 내부 diff에는 경량 `diff` 패키지(jsdiff)를 사용한다.
- 완성형 코드 에디터나 diff viewer 컴포넌트는 도입하지 않는다.
- `diff` 패키지는 화면용 라인 대응과 단어/문자 차이 계산에만 사용한다.
- CJK 및 결합문자 처리는 `Intl.Segmenter` 결과와 문자/grapheme fallback을 조합한다.
- GitHub patch 파싱, 댓글 가능한 라인 판정, 3열 화면 모델 변환은 앱 내부의 독립 모듈로 구현한다.
- 자체 diff 결과를 GitHub 댓글 위치의 원본으로 사용하지 않는다.

### 3.6 Markdown 원문 표시

- Source/Before/After 파일은 렌더링된 문서가 아니라 Markdown 원문 텍스트로 표시한다.
- 별도 syntax highlighting 패키지는 1차 버전에 도입하지 않는다.
- Markdown 특수문자와 저장소 콘텐츠는 HTML로 해석하지 않고 안전한 텍스트 노드로 렌더링한다.
- 고정폭 글꼴, 줄번호, GitHub 스타일 line/intra-line diff 강조를 우선한다.
- diff 표시와 충돌할 수 있는 임의 HTML wrapping을 피한다.
- Markdown syntax highlighting은 실제 사용자 요구가 확인되면 후속 기능으로 검토한다.

### 3.7 스타일과 테마

- Tailwind와 CSS-in-JS 라이브러리는 사용하지 않는다.
- 색상, 간격, 테두리, 글꼴, diff 상태 등 전역 디자인 토큰은 CSS custom properties로 정의한다.
- 컴포넌트별 스타일은 CSS Modules로 분리해 전역 클래스 충돌을 방지한다.
- Light/Dark/System 테마는 루트의 `data-theme` 속성과 CSS 변수로 구현한다.
- System 모드는 `prefers-color-scheme` 변경을 실시간 반영한다.
- 반응형 레이아웃은 CSS media query를 사용한다.
- 동적인 패널 열 개수처럼 런타임 계산이 필요한 값만 제한적으로 React inline style 또는 CSS 변수로 전달한다.
- GitHub의 시각 구조를 참고하되 자체 디자인 토큰을 사용하고 GitHub CSS를 복사하거나 런타임으로 불러오지 않는다.
- 아이콘은 `lucide-react`를 사용하며 실제 사용하는 SVG 아이콘만 번들에 포함되게 한다.
- emoji나 운영체제 종속 문자 기호를 기능 아이콘으로 사용하지 않는다.
- 아이콘 전용 버튼에는 `aria-label` 또는 동등한 접근성 이름을 반드시 제공한다.
- locale 표시에 국기 아이콘을 사용하지 않고 locale 코드와 언어 이름을 사용한다.

### 3.8 런타임 데이터 검증과 저장 형식

- Zod 같은 런타임 스키마 패키지는 추가하지 않는다.
- GitHub API wrapper에서 앱이 실제 사용하는 필드만 작은 type guard와 parser로 검증한다.
- 외부 API 응답을 TypeScript 타입으로 단순 단언하지 않는다.
- localStorage와 sessionStorage 데이터에는 schema version을 포함한다.
- 저장 데이터를 읽을 때 JSON 파싱 오류, 필드 누락, 잘못된 enum과 구버전 형식을 처리한다.
- 복구할 수 없는 저장 데이터는 해당 항목만 삭제하고 안전한 기본값으로 되돌린다.
- 저장 데이터 마이그레이션과 손상 복구는 단위 테스트로 검증한다.

### 3.9 코드 구조

기능 중심 구조를 사용하되 지나치게 깊은 추상화는 피한다. 예상 구조는 다음과 같다.

```text
src/
  app/          앱 진입점, 라우터, provider, 전역 오류 경계
  api/          GitHub REST/GraphQL fetch wrapper, pagination, 오류 모델
  features/
    auth/       토큰 설정, 연결 테스트, 권한 상태
    pull/       PR URL, 메타데이터, freshness 확인
    locales/    locale 감지, 경로 매핑, 방향 결정
    files/      파일 목록, lazy content 조회, 파일 선택
    diff/       patch 파싱, line/intra-line diff, 3열 모델
    comments/   기존 댓글, 답글, 즉시 댓글, pending review
    viewed/     GraphQL Viewed 상태
    settings/   테마, locale 규칙, 저장소 설정
  components/   여러 feature에서 재사용하는 작은 UI 컴포넌트
  storage/      versioned localStorage/sessionStorage adapter와 migration
  styles/       전역 토큰, reset, theme
  test/         공통 fixture builder, MSW handler, 테스트 유틸
```

- feature 내부에서만 쓰는 컴포넌트, hook, 타입은 해당 feature에 둔다.
- API response 타입과 화면 view model을 분리한다.
- patch 파싱, 경로 매핑, diff 계산, 저장소 parser는 React에 의존하지 않는 순수 함수로 작성한다.
- 범용화를 예상해 이른 시점에 공통 abstraction을 만들지 않고 실제 두 곳 이상에서 재사용될 때 추출한다.
- barrel export를 과도하게 만들지 않아 순환 의존성과 tree-shaking 문제를 피한다.
- 컴포넌트는 데이터 조회와 복잡한 변환을 직접 수행하지 않고 feature hook 또는 순수 모듈의 결과를 렌더링한다.

### 3.10 패키지 관리와 의존성 원칙

- 현재의 npm과 `package-lock.json`을 유지한다.
- production 의존성은 React, React DOM, React Router, TanStack Query, `diff`, DOMPurify, `lucide-react`를 기본 목록으로 한다.
- 개발 의존성은 TypeScript, Vite, React plugin, Vitest, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, MSW, Playwright, `@axe-core/playwright`, Biome을 기본 목록으로 한다.
- 새 라이브러리는 표준 Web API나 작은 내부 모듈로 명확히 해결하기 어려울 때만 추가한다.
- 완성형 UI kit, 코드 에디터, diff viewer, CSS framework, 범용 상태 관리 라이브러리는 사용하지 않는다.
- 의존성을 추가할 때 번들 크기, 브라우저 지원, 유지보수 상태, 라이선스와 보안 영향을 확인한다.
- production build에서 번들 크기를 기록하고 예상하지 못한 큰 증가를 검토한다.
- 1차 기준으로 초기 JavaScript entry gzip 크기 200KB 이하를 목표로 한다. 초과하면 의존성 구성과 code splitting을 검토하며 기능 정확성을 희생해 수치만 맞추지 않는다.

### 3.11 브라우저 표준 API 사용

- 설정과 리뷰 입력은 React controlled form과 기본 HTML form validation을 사용하며 별도 form 라이브러리를 추가하지 않는다.
- 날짜와 상대 시각 표시는 `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`을 사용한다.
- locale 이름은 가능한 경우 `Intl.DisplayNames`를 사용하고 지원하지 않는 환경에는 locale 코드 자체를 표시한다.
- 문자열 분할은 `Intl.Segmenter`를 우선 사용하고 명시적인 fallback을 둔다.
- LTR/RTL 판정은 브라우저 locale 정보와 검증된 fallback 목록을 조합한다.
- 파일 레이아웃 매칭은 두 내장 규칙에 맞춘 작은 parser로 구현하며 glob/정규식 라이브러리를 추가하지 않는다.
- 요청 취소는 `AbortController`, 탭 복귀 감지는 Page Visibility API, 시스템 테마 감지는 `matchMedia`를 사용한다.

## 4. 1차 출시 범위

### 4.1 PR 불러오기와 탐색

- GitHub PR URL을 파싱하고 유효성을 검사한다.
- PR 정보, base/head 커밋, 변경 파일, 리뷰, 리뷰 댓글을 조회한다.
- 다음 오류 상태를 명확히 구분한다.
  - 잘못된 URL
  - 존재하지 않거나 접근할 수 없는 PR
  - 저장소 접근 권한 부족
  - API rate limit 초과와 초기화 시각
  - 유효한 PR이지만 번역 파일이 없는 경우
  - 네트워크 오류
- 상황에 맞게 `Open on GitHub`, `Retry`, `Close PR` 동작을 제공한다.
- PR을 닫으면 빈 시작 화면으로 이동하고 탭에만 저장된 화면 상태를 삭제한다.
- 유효한 GitHub 토큰과 PR 읽기 권한이 확인된 뒤에만 PR을 불러온다. 토큰이 없으면 PR URL을 입력하더라도 조회를 시작하지 않고 토큰 설정을 안내한다.

### 4.2 번역 파일 감지

- 기본 원문 locale은 `en`으로 설정한다.
- 기본 번역 레이아웃은 locale 디렉터리형 `content/{locale}/**/*.md`로 설정한다.
- 기본 지원 형식은 Markdown이다.
- 1차 버전에서 다음 두 가지 내장 번역 레이아웃을 지원한다.
  - locale 디렉터리형: `content/{locale}/guide.md` → `content/{sourceLocale}/guide.md`
  - 파일명 접미사형: `content/guide.{locale}.md` → `content/guide.{sourceLocale}.md`
- 파일명 접미사형은 Hugo의 기본 언어 파일처럼 원문에 locale 접미사가 없는 형태도 지원한다: `content/guide.ko.md` → `content/guide.md`.
- 설정에서 레이아웃 종류, 콘텐츠 루트, 파일 확장자, 접미사형 원문 locale 포함 여부를 선택할 수 있게 한다.
- 임의 정규식이나 범용 매핑 규칙 편집기는 1차 버전에 포함하지 않는다.
- 설정에서 원문 locale을 변경할 수 있게 한다.
- 변경 파일 경로에서 대상 locale을 자동 감지한다.
- 선택한 레이아웃 규칙에 따라 대상 locale을 원문 locale로 교체하거나 접미사를 제거해 대응 원문 경로를 계산한다.
- 파일명에 점이 여러 개 있어도 임의 구간을 locale로 추측하지 않고 설정된 locale 또는 감지 가능한 BCP 47 형태의 마지막 접미사만 후보로 취급한다.
- 한 PR에 디렉터리형과 접미사형이 섞여 있으면 활성화된 내장 규칙별로 감지하고, 하나의 파일이 여러 규칙에 일치하면 모호한 매핑으로 표시해 사용자가 규칙을 선택하게 한다.
- 원문 locale은 대상 locale 필터에서 제외한다.
- 일치하는 파일이 없으면 `No translation files found`와 현재 패턴을 보여주고 설정 수정 및 재시도 동작을 제공한다.

### 4.3 선호 locale과 PR별 필터

- 자주 검토하는 locale 목록을 브라우저 설정에 저장하며 기본값은 `ko`로 한다.
- PR을 열 때 PR에 존재하는 선호 locale을 자동 선택한다.
- 현재 PR에서 감지된 모든 locale과 파일 개수를 표시한다.
- 전역 선호 설정을 바꾸지 않고 현재 PR에서만 locale 선택을 변경할 수 있게 한다.
- 선호 locale이 PR에 없으면 무관한 locale을 임의로 선택하지 않고 감지 결과를 안내한다.
- 선택한 locale의 파일만 사이드바와 리뷰 진행률에 포함한다.
- locale 필터로 숨겨진 파일 수를 표시한다.
- 현재 선택 상태는 해당 탭과 PR 세션에 저장한다.
- 선택하지 않은 locale 파일이 있는 상태에서 Approve 또는 Request changes를 제출하면 리뷰 결정이 PR 전체에 적용된다는 경고를 표시한다.

### 4.4 언어 및 문자 방향 지원

- 유효한 BCP 47 locale과 Unicode 텍스트를 특정 언어 allowlist로 제한하지 않는다.
- 앱 UI, 파일 경로, 줄번호, diff 기호는 LTR을 유지한다.
- 번역 본문과 해당 댓글 입력 영역만 locale 방향에 따라 LTR 또는 RTL을 적용한다.
- 브라우저가 제공하는 locale 방향 정보를 우선 사용하고 명시적 fallback 목록을 둔다.
- 1차 공식 RTL 검증 locale은 아랍어 `ar`, 히브리어 `he`, 페르시아어 `fa`, 우르두어 `ur`로 한다. 지역 코드 변형도 기본 언어 방향을 상속한다.
- 1차 공식 LTR 검증 locale은 영어 `en`, 한국어 `ko`, 일본어 `ja`, 중국어 간체 `zh-CN`, 중국어 번체 `zh-TW`, 프랑스어 `fr`, 독일어 `de`, 스페인어 `es`, 이탈리아어 `it`, 포르투갈어 `pt-BR`, 폴란드어 `pl`로 한다.
- 위 목록 밖의 locale도 차단하지 않으며 지원하지 않는 분할 기능은 기본 문자열/grapheme 비교로 fallback한다.
- RTL 검증은 번역 정확성이 아니라 방향, 혼합 문자, 줄번호 및 diff UI 분리, 레이아웃 안정성을 대상으로 한다.

### 4.5 파일 상태와 내용 조회

다음 Markdown 파일 상태를 모두 지원한다.

- 수정: 원문 / 변경 전 번역 / 변경 후 번역
- 추가: 원문 / 빈 변경 전 / 변경 후 번역
- 삭제: 원문 / 변경 전 번역 / 빈 변경 후
- 이름 변경: 이전 경로와 새 경로를 표시하고 내용을 비교
- 대응 원문 없음: 번역 diff는 유지하면서 `Source file not found` 표시
- 바이너리 파일과 설정 패턴에서 제외된 파일은 표시하지 않음

GitHub PR diff와 동일한 기준을 사용하기 위해 `pull.base.sha`를 변경 전 기준으로 직접 사용하지 않는다. Compare API의 `merge_base_commit.sha`를 조회하고 이를 변경 전 파일의 기준 커밋으로 사용한다. 이렇게 해야 PR 생성 후 base 브랜치에 추가된 무관한 변경이 기존 번역에 섞이지 않는다.

포크 PR을 기본 시나리오로 지원한다.

- 원문과 변경 전 번역은 `base.repo.full_name`의 merge base commit에서 조회한다.
- 변경 후 번역은 `head.repo.full_name`의 `head.sha`에서 조회한다.
- 포크 저장소가 삭제되거나 비공개로 전환되어 직접 조회할 수 없으면 base 저장소의 PR ref/도달 가능한 head SHA와 변경 파일의 Git blob SHA 순서로 조회를 시도한다.
- fallback도 실패하면 PR patch로 가능한 diff는 표시하되 전체 변경 후 파일을 가져올 수 없다는 명시적 오류 상태를 표시한다.

긴 파일에서 GitHub의 patch 데이터가 생략될 수 있으므로 전체 내용을 각 Git ref에서 직접 조회한다.

- 원문: 대응하는 원문 locale 파일. 기본적으로 merge base commit을 사용한다.
- PR에서 원문도 함께 수정된 경우 현재 표시 중인 원문 revision을 명확히 알리고 필요하면 head 원문도 선택할 수 있게 한다.
- 변경 전 번역: merge base commit의 대상 파일
- 변경 후 번역: PR head 커밋의 대상 파일

GitHub patch 정보와 브라우저에서 계산한 라인 diff를 함께 사용해 전체 파일을 표시하면서도 GitHub에 유효한 댓글 위치를 유지한다.

파일 내용 조회와 디코딩은 다음 규칙을 따른다.

- 가능하면 Contents API의 raw media type으로 UTF-8 원문을 직접 받는다.
- JSON의 base64 응답을 사용할 때는 base64를 byte array로 변환한 뒤 `TextDecoder("utf-8")`로 디코딩한다. `atob()` 결과를 텍스트로 직접 사용하지 않는다.
- Contents API의 `content`가 비어 있는 크기의 파일은 raw media type 또는 Git Blob API를 사용한다.
- 100MB를 초과하거나 GitHub API가 제공하지 않는 파일은 지원 불가 상태로 표시한다.
- PR을 열 때 모든 파일 내용을 선행 조회하지 않도록 조회 시점과 캐시 정책을 별도로 정의한다.

### 4.6 3열 diff 뷰어

- 변경 파일은 한 번에 하나만 표시한다. GitHub처럼 모든 파일을 세로로 이어 붙이지 않는다.
- 좌측 파일 트리에서 파일을 선택하고 검색할 수 있게 하며 이전 파일과 다음 파일 이동을 제공한다.
- PR을 처음 열면 선택된 locale에서 첫 번째 검토 대상 파일을 선택하되, 세션에 마지막 선택 파일이 있으면 이를 복원한다.
- PR 메타데이터와 변경 파일 목록을 먼저 조회하고, 선택한 파일의 Source/Before/After 내용만 lazy fetch한다.
- 한 번 조회한 파일 내용과 계산된 diff는 현재 탭의 메모리 캐시에 보관하며 PR head SHA가 바뀌면 관련 캐시를 무효화한다.
- 파일 전환 시 각 파일과 패널의 스크롤 위치를 세션에 기억한다.
- 원문, 변경 전, 변경 후의 전체 파일을 기본으로 표시한다.
- 각 패널의 실제 줄번호를 독립적으로 유지한다.
- GitHub와 유사한 색상으로 추가, 삭제, 변경 영역을 강조한다.
- 변경 전과 변경 후에서 대응 관계가 확실한 라인은 줄 내부 변경점도 강조한다.
  - 공백 기반 언어는 단어 단위로 비교한다.
  - 한국어, 중국어, 일본어 등은 `Intl.Segmenter`를 사용해 단어 단위로 나누고 필요하면 grapheme 단위로 보완한다.
  - Markdown 문법 토큰을 특별히 해석하지 않고 화면용 텍스트 차이만 계산한다.
  - 대응 라인이 불확실하거나 줄 길이 및 계산 비용 제한을 넘으면 세부 강조를 생략하고 안정적인 라인 단위 강조로 fallback한다.
  - 줄 내부 diff는 화면 표시만 담당하며 GitHub 댓글 위치 계산에는 사용하지 않는다.
- 각 열을 표시하거나 숨길 수 있게 하되 최소 한 열은 남긴다.
- 이전 변경 및 다음 변경 탐색을 제공한다.
- 각 패널에서 텍스트를 검색할 수 있게 한다.
- 기본적으로 패널별 독립 스크롤을 사용한다.
- `Sync scrolling`을 켜면 동일 줄번호가 아니라 전체 스크롤 비율을 기준으로 패널을 동기화한다.
- 언어별 줄 정렬이 다를 수 있으므로 스크롤 동기화는 선택 기능으로 유지한다.
- `Changes only` 압축 보기를 선택 기능으로 제공한다.
  - 변경 전과 변경 후는 diff hunk 중심으로 축약한다.
  - 원문은 관련 문장이 잘려 나가지 않도록 전체 내용을 유지한다.
  - 이 모드에서는 스크롤 동기화를 끄고 이유를 안내한다.
- 1차 버전에는 렌더링된 Markdown 미리보기를 넣지 않는다.
- 문단 단위 자동 정렬은 구현하지 않는다.
- 처음부터 가상화를 넣지 않고 실제 성능 문제가 확인될 때 추가한다.

### 4.7 Viewed 상태

- Viewed 기능은 인증된 사용자에게만 제공한다.
- GraphQL의 `viewerViewedState`로 현재 사용자의 실제 GitHub 상태를 조회한다.
- `markFileAsViewed`, `unmarkFileAsViewed` mutation으로 상태를 변경한다.
- 토큰이 없는 사용자는 앱의 PR 리뷰 화면에 진입할 수 없다.
- 파일이 다시 변경되면 GitHub가 Viewed를 해제하는 동작을 그대로 따른다.
- 화면 진행률은 선택된 locale 파일만 계산하되 파일별 상태의 원본은 GitHub로 유지한다.

### 4.8 기존 리뷰 대화

- 기존 인라인 리뷰 댓글과 전체 리뷰 댓글을 표시한다.
- 작성자, 아바타, 작성 시각, 본문, outdated 상태, GitHub 원문 링크를 제공한다.
- 권한이 있는 인증 사용자는 기존 리뷰 댓글에 답글을 작성할 수 있다.
- 댓글 API에는 GitHub의 full media type을 사용해 raw 본문과 GitHub가 렌더링한 HTML을 한 응답에서 받는다.
- 댓글 표시는 GitHub의 `body_html`을 DOMPurify로 다시 정제한 뒤 사용한다. 검증되지 않은 HTML을 직접 삽입하지 않는다.
- 댓글 작성, 편집용 값과 복사에는 raw `body`를 사용한다.
- 외부 링크에는 안전한 `rel` 속성을 강제하고 이미지 URL은 CSP 허용 origin 정책을 따른다.
- 조회 데이터에서 확인 가능한 경우 resolved 상태는 표시하되 Resolve/Unresolve 조작은 1차 버전에서 제외한다.

### 4.9 댓글과 리뷰 작성

- 자체 계산한 diff는 화면 표시에만 사용한다. 댓글 가능 라인은 GitHub가 제공한 patch hunk를 기준으로 판정한다.
- 새 인라인 댓글은 deprecated되는 `position` 대신 `commit_id`(현재 head SHA), `path`, `line`, `side`를 사용한다. 여러 줄 댓글에는 `start_line`, `start_side`도 사용한다.
- patch가 없거나 잘려 안전한 위치를 계산할 수 없는 파일은 전체 파일 비교는 허용하되 인라인 댓글을 비활성화하고 이유를 표시한다.
- PR files API의 최대 3,000개 파일 제한을 감지하고 불완전한 결과를 정상 완료로 표시하지 않는다.
- 다음 두 가지 흐름을 모두 지원한다.
  - 단일 댓글 즉시 등록
  - pending review에 댓글을 모은 뒤 일괄 제출
- 다음 GitHub 리뷰 종류를 지원한다.
  - Comment
  - Approve
  - Request changes
- PR을 열거나 첫 pending 댓글을 추가하기 전에 현재 사용자의 기존 `PENDING` 리뷰를 조회한다.
- 기존 `PENDING` 리뷰가 있으면 해당 review ID를 재사용하고, 없을 때만 새 pending review를 생성한다.
- 생성 중 422 등 경쟁 상태가 발생하면 리뷰 목록을 다시 조회해 기존 pending review를 복구한다.
- PR을 다시 열면 GitHub 서버에 저장된 pending review 댓글을 복원한다.
- 제출 성공이 확인된 후에만 로컬 초안과 전체 리뷰 본문을 삭제한다.
- 제출 실패 시 내용은 보존하고 재시도 가능한 오류를 표시한다.
- 토큰은 필수다. 토큰이 없거나 유효하지 않으면 PR 조회와 모든 리뷰 기능을 사용할 수 없다.
- 토큰은 유효하지만 저장소 쓰기 권한이 없는 경우에는 PR 조회와 비교만 허용하고 Viewed, 댓글, 답글, 리뷰 제출을 비활성화한다.

### 4.10 새로고침과 초안 보호

- 수동 `Refresh`는 최신 GitHub 데이터를 즉시 불러와 반영한다.
- 제출하지 않은 textarea 내용이 영향을 받을 수 있으면 수동 갱신 전에 경고한다.
- 다른 탭에서 돌아왔을 때는 데이터를 바로 교체하지 않고 가벼운 변경 여부 확인만 수행한다.
- head 커밋이나 리뷰 데이터가 바뀌었으면 `New changes available — Reload` 배너를 표시한다.
- 1차 버전에는 주기적인 polling을 넣지 않는다.
- 전송하지 않은 textarea 내용은 `sessionStorage`에 보존한다.
- 갱신 후 가능한 초안은 새 diff의 유효한 위치에 다시 연결한다.
- 연결할 라인이 사라진 초안은 `Unmapped draft` 영역에 보존하고 복사 및 삭제 기능을 제공한다.

## 5. 인증과 브라우저 저장소

### 5.1 인증 방식

- Fine-grained PAT와 classic PAT를 모두 허용한다.
- UI와 문서에서는 Fine-grained PAT를 권장한다.
- 토큰 생성 링크와 최소 권한 안내를 제공한다.
- 권장 Fine-grained PAT 설정은 다음과 같다.
  - 검토할 저장소로 접근 범위 제한
  - Contents: Read-only
  - Pull requests: Read and write
  - 짧은 만료 기간
- 토큰 접두어만 보고 기능을 판단하지 않고 실제 API 요청으로 권한을 검증한다.
- `Test connection` 버튼을 제공한다.
- 검증에 성공하면 사용자 로그인명과 아바타, 저장소 접근 여부, 사용 가능한 리뷰 기능을 표시한다.
- 유효한 토큰이지만 해당 저장소의 쓰기 권한이 부족하면 제한 이유를 표시하고 저장소 단위 읽기 전용으로 동작한다.

### 5.2 토큰 저장 선택

- 기본값은 `sessionStorage`이며 같은 탭의 새로고침 동안만 토큰을 유지한다.
- 사용자가 `Remember token on this device`를 명시적으로 선택하면 `localStorage`에 저장한다.
- 저장 모드를 바꾸면 이전 저장소의 토큰을 제거한다.
- 명확한 `Clear token` 동작을 제공한다.
- 토큰을 URL, 앱 로그, 오류 메시지, 분석 데이터, PR 상태 데이터에 포함하지 않는다.
- 토큰은 GitHub API origin으로만 전송한다.
- 외부 분석 도구, 광고, 원격 스크립트, CDN JavaScript를 사용하지 않는다.
- 토큰 입력란 주변에 `This app runs entirely in your browser` 안내와 공용 기기 저장 위험을 표시한다.

### 5.3 기타 저장 정책

`localStorage`에 저장할 항목:

- 테마 선택
- 원문 locale
- 선호 대상 locale
- 번역 경로 및 확장자 패턴
- 사용자가 Remember를 선택한 경우에만 토큰

`sessionStorage`에 저장할 항목:

- 기본 방식의 토큰
- 현재 PR 탭 상태
- 선택한 locale 필터
- 선택한 파일과 스크롤 위치
- 전송하지 않은 textarea 초안

최근 PR 기록은 저장하지 않는다. 인증된 경우 Viewed와 pending review는 GitHub 데이터를 원본으로 사용한다.

기존 프로토타입을 실행한 브라우저에는 `locale-review-settings` 안에 토큰이 남아 있을 수 있다. 새 저장 구조를 처음 실행할 때 이 레거시 토큰 필드를 삭제하는 일회성 마이그레이션을 수행한다. 마이그레이션 중 토큰 값을 로그나 다른 저장소로 복사하지 않는다.

## 6. GitHub API 설계

REST와 GraphQL 세부 구현이 UI 컴포넌트에 노출되지 않도록 타입이 정의된 API 계층을 만든다.

### REST 담당 기능

- 인증 사용자 검증
- PR 정보
- 변경 파일과 patch
- base/head ref의 저장소 파일 내용
- 리뷰와 리뷰 댓글
- 단일 댓글 즉시 등록
- pending review 생성, 댓글 추가, 제출
- 리뷰 댓글 답글
- rate limit 및 권한 오류 표준화

### GraphQL 담당 기능

- 변경 파일의 `viewerViewedState` 조회
- 파일 Viewed 처리
- 파일 Viewed 해제

GitHub 응답에 pagination이 있으면 모두 처리한다. PR이나 파일을 전환할 때 이전 요청을 취소하고 보수적인 메모리 캐시를 사용한다. 오류 형식은 하나로 통일한다. 댓글이나 리뷰가 중복 등록될 수 있는 mutation은 자동 재시도하지 않는다.

API 계층은 base 저장소와 head 저장소를 별도 식별자로 유지해야 하며, 동일 저장소 PR이라고 가정하지 않는다. Compare API에서 얻은 merge base SHA, 현재 head SHA, GitHub patch를 하나의 PR diff 기준 정보로 묶어 하위 계층에 전달한다.

## 7. 화면 구성

### 시작 화면

- 제품 이름과 PR URL 입력란
- `Open pull request` 기본 버튼
- 필수 토큰 상태와 연결 테스트 결과
- 설정 진입 버튼
- 짧은 개인정보 및 보안 안내

### PR 리뷰 화면

- 저장소, PR 번호, 제목, 작성자, base/head 브랜치, open/draft/closed 상태를 표시하는 GitHub 스타일 헤더
- 검색, 파일 상태, 추가/삭제 줄 수, 댓글 수, Viewed, 선택 locale 진행률을 포함한 파일 사이드바
- 파일 사이드바의 선택 상태, 이전/다음 파일 이동, 선택 파일 로딩 상태
- 파일 수가 표시된 locale 필터와 숨겨진 파일 수
- 경로, 파일 상태, GitHub 링크, Viewed, 접기 기능을 포함한 파일 헤더
- 반응형 제어가 가능한 3열 뷰어
- diff 라인에 연결된 기존 댓글 대화
- 리뷰 요약 입력과 pending 댓글 수
- 작성 중인 내용을 임의로 버리지 않는 갱신 및 새 변경 안내

### 반응형 동작

- 데스크톱의 3열 리뷰를 주 사용 환경으로 설계한다.
- 최신 모바일 브라우저에서는 조회와 간단한 댓글 작성을 지원한다.
- 좁은 화면에서는 세 열을 억지로 축소하지 않고 Source / Before / After를 한 번에 하나씩 전환한다.

### 접근성

- 모든 제어 요소를 키보드로 사용할 수 있고 명확한 포커스를 표시한다.
- diff 라인, 댓글 버튼, 파일 상태, 테마 제어에 적절한 접근성 이름을 제공한다.
- Light/Dark 색상 모두 충분한 대비를 유지한다.
- 추가, 삭제, 경고를 색상으로만 구분하지 않는다.
- `prefers-reduced-motion`을 존중한다.

## 8. 구현 순서

### 공통 개발 워크플로

모든 Phase는 아래 순서를 동일하게 따른다. Phase의 기능 구현만 끝났다는 이유로 다음 Phase로 넘어가지 않는다. 단위 테스트와 실제 브라우저 기능 테스트, 최종 검증까지 모두 통과해야 해당 Phase를 완료로 처리한다.

현재 프로토타입 상태는 구현 시작 전 `init` 커밋으로 보존한다. 이후에는 하나의 개발 흐름에서 기능 개발, 버그 수정, 테스트 추가, 리팩터링처럼 의미가 분리되는 작업마다 작은 커밋을 남긴다. Phase 전체를 하나의 거대한 커밋으로 만들지 않는다.

- 커밋 하나에는 설명 가능한 하나의 목적만 담는다.
- 기능 코드와 해당 기능을 검증하는 테스트는 가능한 한 같은 커밋에 포함한다.
- 테스트 실패 상태나 production build 실패 상태는 완료 커밋으로 남기지 않는다.
- 스캐폴딩 제거, 도구 설정, 기능 구현, 버그 수정, 문서 변경은 서로 의미가 다르면 별도 커밋으로 구분한다.
- 기존 커밋을 반복적으로 amend하거나 재작성하기보다 개발 진행과 수정 이유가 드러나는 후속 커밋을 남긴다.
- 각 Phase의 마지막에는 완료 조건과 전체 회귀 테스트 통과 상태를 기록하는 명확한 커밋을 남긴다.
- remote push와 PR 생성은 별도 요청 또는 합의가 있을 때 수행한다.

```text
Phase 시작
  ↓
요구사항·완료 조건 확인
  ↓
기능 개발
  ↓
단위 테스트 작성·보완
  ↓
단위 테스트 실행
  ├─ 실패 → 원인 분석 → 기능 또는 테스트 수정 → 단위 테스트 재실행
  └─ 통과
       ↓
기능 테스트 작성·보완
       ↓
실제 브라우저 기능 테스트
  ├─ 실패 → 원인 분석 → 기능 또는 테스트 수정
  │          → 단위 테스트 재실행 → 브라우저 기능 테스트 재실행
  └─ 통과
       ↓
Phase 완료 조건 검증
  ├─ 미충족 → 기능 개발 단계로 복귀
  └─ 충족 → 회귀 테스트 전체 실행 → 다음 Phase
```

각 Phase의 구체적인 작업 순서는 다음과 같다.

1. **Phase 준비**
   - 해당 Phase의 범위, 비범위, 선행 조건과 완료 조건을 다시 확인한다.
   - 구현할 기능을 독립적으로 검증 가능한 작은 작업으로 나눈다.
   - 필요한 GitHub API fixture, 오류 fixture, locale fixture를 기능 개발 전에 준비한다.
   - 이전 Phase의 전체 테스트가 통과하는 기준 상태에서 시작한다.

2. **기능 개발**
   - 현재 Phase 범위에 포함된 기능만 구현한다.
   - 다음 Phase 기능을 미리 섞거나 비범위 기능을 임의로 추가하지 않는다.
   - API 호출, 상태 모델, 화면 컴포넌트를 분리해 각 계층을 독립적으로 테스트할 수 있게 한다.
   - 구현 중 발견한 계획 누락이 제품 동작을 바꾸면 임의로 결정하지 않고 계획을 갱신한 뒤 진행한다.

3. **단위 테스트 작성 및 실행**
   - 정상 흐름뿐 아니라 경계값, 권한 오류, 네트워크 오류, 잘못된 데이터와 fallback을 테스트한다.
   - 새 기능과 함께 테스트를 작성하며 Phase 마지막에 한꺼번에 몰아서 작성하지 않는다.
   - 관련 Vitest 및 Testing Library 테스트를 먼저 실행한다.
   - 실패하면 실패 원인이 제품 코드, fixture, 테스트 가정 중 어디에 있는지 확인하고 수정한다.
   - 관련 테스트 통과 후 전체 단위·통합 테스트를 실행해 이전 Phase의 회귀가 없는지 확인한다.

4. **기능 테스트 작성 및 실제 브라우저 검증**
   - MSW로 GitHub API를 모킹한 Playwright 시나리오를 작성한다.
   - Chromium, Firefox, WebKit에서 해당 Phase의 핵심 사용자 흐름을 실행한다.
   - 필요하면 Codex in-app Browser 또는 Claude Playwright 브라우저 기능으로 로컬 화면을 직접 조작해 DOM, 레이아웃, 반응형 동작과 스크린샷을 확인한다.
   - Light/Dark, 데스크톱/모바일, LTR/RTL 중 해당 Phase가 영향을 주는 조합을 확인한다.
   - 브라우저 테스트가 실패하면 기능 개발 단계로 돌아가 수정하고, 단위 테스트부터 다시 실행한다.
   - 에이전트 브라우저 연결이 일시적으로 제공되지 않더라도 브라우저 검증을 생략한 채 Phase를 완료하지 않는다. 저장소의 Playwright 테스트 또는 사용 가능한 실제 브라우저 환경에서 검증을 끝낸다.

5. **Phase 완료 검증**
   - 해당 Phase 아래에 적힌 완료 조건을 항목별로 확인한다.
   - typecheck, lint/format, 전체 단위·통합 테스트, 관련 Playwright 테스트와 production build를 실행한다.
   - 실패, 미구현, 임시 mock, 수동 확인 필요 사항이 남아 있으면 Phase를 완료로 표시하지 않는다.
   - 알려진 제한이 생겼다면 비범위 또는 후속 작업으로 문서화하고 사용자 승인이 필요한 범위 변경은 확인받는다.

6. **Phase 종료 및 다음 단계 이동**
   - 구현 내용, 테스트 결과, 남은 제한과 다음 Phase의 선행 조건을 기록한다.
   - Phase에서 변경된 설계나 API 제약을 `plan.md`와 관련 문서에 반영한다.
   - 전체 회귀 테스트가 통과하고 완료 조건이 충족된 경우에만 다음 Phase를 시작한다.

### 공통 Phase 완료 게이트

모든 Phase는 최소한 아래 명령 또는 이에 대응하는 스크립트가 성공해야 완료할 수 있다. 실제 스크립트 이름은 Phase 0에서 `package.json`에 확정한다.

```text
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run build
```

- 빠른 개발 반복 중에는 관련 테스트만 선택 실행할 수 있다.
- Phase 완료 시에는 반드시 전체 회귀 테스트를 실행한다.
- 테스트를 건너뛰거나 실패를 무시하는 옵션으로 완료 게이트를 통과시키지 않는다.
- flaky 테스트는 단순 재실행으로 덮지 않고 원인을 추적해 안정화하거나 격리 사유와 해결 계획을 기록한다.
- 실제 GitHub 쓰기 검증은 자동 테스트와 분리하며, 사용자 승인을 받은 전용 테스트 PR에서만 수행한다.

### 0단계: 기반 정리

1. 현재 프로토타입 상태를 `init` 기준 커밋으로 보존한다. Git remote 생성, push, 외부 테스트 저장소 생성은 실행 전에 사용자 승인을 받는다.
2. 현재 리포의 `app/`, `db/`, `worker/`, `drizzle/`, `examples/d1/`, `.wrangler/`, `.vinext/`, `.openai/`, `build/` 등 다른 템플릿 잔재를 확인해 제거한다.
3. 생성된 `vite.config.js`, `vite.config.d.ts`, `*.tsbuildinfo`, 빌드 산출물이 커밋되지 않도록 제거하고 `.gitignore`를 Vite 정적 SPA 기준으로 정리한다.
4. 현재 프로토타입은 시각 참고 자료로만 취급한다. JSON translation unit 기반 `Unit` 타입, 행 정렬, `changesOnly` 상태 로직은 Markdown 전체 파일 모델에 승계하지 않는다.
5. 기존 `locale-review-settings`에 저장된 토큰을 삭제하는 일회성 마이그레이션을 추가한다.
6. 코드와 실제 UI는 영어, 계획 및 협업 문서는 한국어라는 언어 정책에 맞춰 `index.html`, README와 화면 문구를 정리한다.
7. 루트와 PR hash 경로의 라우팅 및 상태 규칙을 만든다.
8. 앱 오류 경계와 안전한 브라우저 저장소 파싱을 추가한다.
9. 공통 타입, 메시지, 테마 토큰, 컴포넌트 구조를 정의한다.
10. Vitest, Testing Library, MSW, Playwright, Biome과 DOMPurify를 설치하고 기본 설정을 추가한다.
11. typecheck, lint/format 검사, 단위 테스트, 프로덕션 빌드를 수행하는 CI를 Phase 0에서 구성한다.
12. mock fixture를 만들고, 쓰기 연동 검증용 전용 저장소와 테스트 PR 준비 절차를 문서화한다.

완료 조건: 정리된 Vite 앱에 기준 커밋이 존재하고, 시작/PR 경로 골격과 테마가 동작하며 typecheck, lint, 단위 테스트, 빌드가 로컬과 CI에서 통과한다.

### 1단계: 인증, 설정, PR 불러오기

1. 토큰의 세션 저장, Remember, 삭제 동작을 구현한다.
2. 연결 테스트와 기능별 권한 상태를 구현한다.
3. 원문 locale, 선호 locale, 파일 패턴 설정을 구현한다.
4. PR URL 파싱, hash 이동, PR 정보 조회, 표준 오류 상태를 구현한다.
5. 빈 시작 화면과 PR 헤더를 만든다.

완료 조건: 토큰 없이는 PR 조회가 시작되지 않고, 유효한 토큰으로 PR이 열리며 인증 및 저장소 권한 오류가 정확히 표시된다.

### 2단계: 번역 파일 발견과 데이터 모델

1. pagination을 포함해 변경 파일 전체를 조회한다.
2. 번역 패턴을 적용하고 locale을 감지한다.
3. locale 디렉터리형과 파일명 접미사형 매핑 및 접미사 없는 기본 원문 규칙을 구현한다.
4. 선호 및 PR별 locale 필터를 구현한다.
5. 원문, 변경 전, 변경 후의 경로와 ref를 계산한다.
6. 수정, 추가, 삭제, 이름 변경, 원문 누락을 처리한다.
7. 선택 파일 단위 lazy fetch, 요청 취소, head SHA 기반 캐시 무효화를 포함해 전체 파일 내용을 조회한다.

완료 조건: 여러 언어와 파일 상태를 가진 fixture가 정확한 3버전 파일 모델로 변환된다.

### 3단계: 전체 파일 3열 diff

1. 브라우저 라인 diff와 GitHub 댓글 위치 매핑을 구현한다.
2. 라인 diff와 분리된 보조 계층으로 단어/grapheme 단위 intra-line diff를 구현하고 안전한 fallback을 둔다.
3. 독립 줄번호가 있는 Source / Before / After 전체 파일을 렌더링한다.
4. 열 표시, 파일 검색, 변경 탐색, 비율 기반 스크롤 동기화, 패널별 검색을 구현한다.
5. Changes only 동작과 해당 모드에서의 sync 비활성화를 구현한다.
6. GitHub 스타일 Light/Dark UI와 좁은 화면 패널 전환을 구현한다.

완료 조건: 원문과 번역문의 줄 정렬 여부와 관계없이 검토할 수 있고 댓글 가능한 라인이 GitHub의 유효한 위치와 일치한다.

### 4단계: Viewed와 기존 대화

1. GraphQL Viewed 조회와 mutation을 추가한다.
2. 파일 진행률, 접기, Viewed UI를 구현한다.
3. 기존 인라인 및 전체 리뷰 댓글을 조회해 표시한다.
4. 인증 사용자의 답글과 GitHub 링크를 추가한다.
5. outdated와 조회 가능한 resolved 상태를 표시한다.

완료 조건: Viewed 변경이 GitHub에 반영되고 기존 리뷰 맥락이 올바른 라인에 표시된다.

### 5단계: 댓글 및 리뷰 제출

1. 단일 댓글 즉시 등록을 구현한다.
2. pending review 생성과 댓글 추가를 구현한다.
3. GitHub에 저장된 pending review를 복원한다.
4. Comment, Approve, Request changes 제출을 구현한다.
5. locale 범위 경고와 실패 시 초안 보호를 구현한다.
6. 토큰 오류 상태에서는 PR 진입을 차단하고, 유효한 토큰에 저장소 쓰기 권한만 없는 읽기 전용 모드에서는 모든 쓰기 UI를 일관되게 비활성화한다.

완료 조건: 통제된 테스트 PR에서 중복 등록 없이 모든 쓰기 흐름이 동작한다.

### 6단계: 갱신 안정성과 마무리

1. 즉시 반영되는 수동 Refresh를 추가한다.
2. 탭 복귀 시 변경 확인과 새 변경 배너를 추가한다.
3. 세션 초안 복원과 unmapped 초안 복구를 추가한다.
4. 키보드, 접근성, 반응형, 로딩, 빈 화면, 오류 상태를 완성한다.
5. 토큰 처리, 외부 요청, 콘텐츠 렌더링, 로그를 보안 관점에서 점검한다.

완료 조건: 새로고침, 새 커밋, 오래된 diff, 요청 실패 상황에서도 사용자 작업이 조용히 사라지지 않는다.

### 7단계: CI와 GitHub Pages 배포

1. Phase 0에서 만든 CI에 Playwright 브라우저 테스트 job과 배포 전 품질 gate를 추가한다.
2. `dist/` 빌드 결과를 사용하는 GitHub Pages 배포 workflow를 추가한다.
3. 저장소 하위 경로에서 Vite 리소스와 hash routing이 동작하게 한다.
4. 배포 안내에서 HTTPS 강제를 명시한다.
5. GitHub Pages에서는 임의 응답 헤더를 설정할 수 없음을 명시하고 HTML meta 기반 Content Security Policy를 적용한다.
6. 저장소 Pages/Actions에서 한 번만 수행할 설정을 문서화한다.

완료 조건: 지정 브랜치에 병합하면 검사와 정적 사이트 배포가 자동으로 완료된다.

## 9. 테스트 전략

테스트는 로직 검증, UI 기능 검증, 실제 브라우저 검증의 세 계층으로 운영한다. 모든 기능 PR은 관련 단위/컴포넌트 테스트와 브라우저 흐름 테스트를 함께 추가하는 것을 원칙으로 한다.

### 단위 테스트

- GitHub PR URL 파싱 및 hash 경로 생성
- glob 및 경로 패턴 매칭
- locale 감지 및 원문 경로 계산
- 디렉터리형, 접미사형, 접미사 없는 기본 원문, `_index.ko.md`, `guide.ko-KR.md`, 여러 점이 포함된 파일명의 경로 매핑
- 이름 변경, 추가, 삭제, 원문 누락 데이터 모델
- 라인 diff와 GitHub 댓글 위치 매핑
- 영문 단어, 한국어·중국어·일본어, emoji/결합문자, 긴 줄, 완전 교체 라인의 intra-line diff와 fallback
- 비율 기반 스크롤 계산
- 안전한 local/session storage 파싱과 마이그레이션
- REST/GraphQL 오류와 rate limit 표준화
- 토큰 저장 모드 전환
- BCP 47 locale 정규화, 지역 코드의 기본 언어 상속, LTR/RTL 방향 결정과 fallback
- `Intl.Segmenter` 지원/미지원 환경의 단어 및 grapheme 분할

### 컴포넌트 및 통합 테스트

- 토큰 없음, 토큰 오류, 인증 성공, 저장소 쓰기 권한 부족 상태별 기능 차이
- locale 필터와 진행률 계산
- 전체 파일 표시와 Changes only 전환
- Viewed mutation 성공 및 실패 시 롤백
- 댓글과 리뷰 초안 보존
- GitHub 댓글 HTML 정제, 위험 속성 제거, 안전한 링크 및 이미지 처리
- Light/Dark/System 테마
- 빈 화면, 로딩, 권한, rate limit, 번역 파일 없음 상태
- 공식 검증 locale별 방향 속성, 혼합 RTL/LTR 문자열, locale 필터와 패널 방향

### GitHub API를 모킹한 브라우저 테스트

- 토큰 없이 PR 열기가 차단되고 토큰 설정 안내가 표시되는지 확인
- 인증 후 권한이 있는 PR fixture 열기
- locale 및 파일 선택, 변경 탐색, sync, 텍스트 검색
- 파일 전환 시 lazy fetch, 캐시 재사용, 스크롤 위치 복원, 새 head SHA의 캐시 무효화
- Viewed 설정 및 해제
- 기존 댓글 조회와 답글 제출
- 즉시 댓글 제출
- pending review 생성 및 제출
- 새로고침 후 미전송 초안 복원
- 탭 복귀 시 새 변경 배너
- 공유 hash 경로 직접 열기
- 좁은 화면의 패널 전환
- `ko`, `ja`, `zh-CN`, `zh-TW`, 주요 유럽 locale의 전체 파일 및 intra-line diff 표시
- `ar`, `he`, `fa`, `ur`의 RTL 본문과 LTR 줄번호/경로/diff 기호 분리
- RTL 문장에 숫자, URL, 영문 코드, placeholder가 섞인 화면
- Light/Dark/System 테마와 데스크톱/모바일 viewport의 시각 회귀 스크린샷

mutation 테스트는 기본적으로 모두 mock API를 사용하며 임의의 실제 저장소에 댓글이나 리뷰를 등록하지 않는다. 실제 연동 검증은 명시적으로 지정한 통제된 테스트 PR에서만 수동으로 수행한다.

### 실제 브라우저 검증 절차

- CI에서는 Playwright를 사용해 Chromium, Firefox, WebKit에서 핵심 흐름을 실행한다.
- 최소 브라우저 흐름은 토큰 설정, PR 열기, locale/파일 선택, lazy fetch, 3열 diff, sync, Viewed, 기존 댓글, 즉시 댓글, pending review, 새로고침 복원으로 한다.
- 실제 GitHub mutation은 CI에서 실행하지 않고 MSW fixture로 검증한다.
- 구현 작업 중 Codex 환경에서는 제공되는 in-app Browser 제어 기능으로 로컬 앱을 직접 열어 DOM 상태, 상호작용, 반응형 화면과 스크린샷을 확인한다. 브라우저 연결을 사용할 수 없는 실행 환경에서는 이를 보고하고 CI Playwright 결과로 대체한다.
- Claude 환경에서는 사용 가능한 Playwright 브라우저 도구로 동일한 기능 체크리스트를 수행한다.
- 에이전트 전용 브라우저 검증은 자동 테스트를 대체하지 않는다. 재현 가능한 회귀 검증은 반드시 저장소의 Playwright 테스트로 남긴다.
- 주요 화면 변경은 Light/Dark, 데스크톱/모바일, LTR/RTL 스크린샷을 확인한다.

### 브라우저 지원 범위

- 최신 Chrome, Edge, Firefox, Safari의 현재 및 직전 주요 버전을 지원 대상으로 한다.
- CI의 Chromium, Firefox, WebKit 결과를 각각 Chrome/Edge 계열, Firefox, Safari 호환성의 자동 검증 기준으로 사용한다.
- 모바일은 Playwright의 Chromium/WebKit 모바일 viewport로 읽기와 간단한 댓글 흐름을 검증한다.

### 품질 및 성능 기준

- 접근성 기준은 WCAG 2.1 AA로 한다.
- axe 기반 자동 접근성 검사와 키보드 탐색 기능 테스트를 핵심 화면에 적용한다.
- 성능 fixture는 파일당 2,000줄, 3열 총 6,000줄을 기준으로 한다.
- 캐시가 없는 선택 파일의 표시 완료 목표는 일반적인 개발용 데스크톱에서 2초 이내로 한다. 네트워크 시간과 렌더링 시간을 별도로 기록한다.
- 반복되는 50ms 이상 long task 또는 지속적인 스크롤 저하가 확인되면 가상화나 Web Worker 도입 조건을 충족한 것으로 본다.
- CI 환경 편차가 큰 절대 FPS만으로 빌드를 실패시키지 않고, 추세와 명백한 회귀를 기록한다.

## 10. 보안 완료 조건

- 토큰이 저장소 파일, 빌드 결과, URL, 앱 로그, 분석 데이터, 화면 캡처, 오류 문구에 나타나지 않는다.
- 토큰은 기본적으로 세션에만 저장하며 영구 저장에는 명시적인 동의를 받는다.
- 인증되지 않은 GitHub API 요청은 보내지 않는다.
- 사용자 및 저장소 텍스트는 텍스트로 표시하거나 검증된 방식으로 안전하게 처리한다.
- 외부 런타임 스크립트를 사용하지 않는다.
- GitHub Pages의 제약 안에서 meta 기반 Content Security Policy를 적용한다. 최소한 `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'self' https://api.github.com`, `img-src 'self' data: https://avatars.githubusercontent.com`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`을 기준으로 한다.
- meta CSP에서는 `frame-ancestors`, report 전송 등 일부 지시어를 사용할 수 없다는 한계를 문서화한다.
- XSS가 발생하면 `sessionStorage`의 토큰도 노출될 수 있다. 세션 저장은 노출 시간을 줄이는 수단이지 XSS 방어책이 아님을 사용자 문서에 명시한다.
- mutation은 검증된 토큰과 사용자의 명시적 동작이 있을 때만 실행한다.
- 권한 및 rate limit 오류를 성공으로 오인하게 표시하지 않는다.
- 문서에서 저장소 제한, 짧은 만료 기간을 가진 Fine-grained PAT를 권장하고 classic PAT의 위험을 설명한다.
- GitHub Pages는 HTTPS로 제공한다.

## 11. 1차 버전에서 제외할 기능

- PR 목록 및 번역 PR 자동 필터링
- GitHub Enterprise Server
- Markdown/Hugo 렌더링 미리보기
- 리뷰 스레드 Resolve/Unresolve
- 의미 기반 문단 정렬 또는 기계 번역
- 실시간 polling, webhook, push 갱신
- 서버 측 토큰 저장, OAuth, GitHub App 인증
- 최근 PR 기록
- 성능 테스트 전의 대용량 파일 가상화
- 플레이스홀더, 변수, 링크, Hugo shortcode의 자동 불일치 검사
- 임의 정규식 기반의 범용 번역 경로 매핑 편집기
- Markdown 원문 syntax highlighting

## 12. 후속 로드맵

1. 저장소별 PR 목록, 번역 파일 필터링, pagination
2. 최소한의 신뢰 가능한 서버를 사용한 GitHub OAuth 또는 GitHub App
3. 리뷰 스레드 Resolve/Unresolve
4. 저장소별 Markdown/Hugo 미리보기
5. 대용량 파일 가상화와 Web Worker 기반 diff
6. API origin 설정 및 CORS 안내를 포함한 GitHub Enterprise Server 지원
7. 준비된 메시지 구조를 활용한 앱 UI 다국어 지원
8. 실제 사용자 요구가 확인될 경우 저장소별 규칙을 적용하는 비차단 번역 품질 경고

## 13. 최종 완료 기준

사용자가 앱을 GitHub Pages에 배포하고, 유효한 GitHub 토큰을 설정한 뒤 `github.com` PR URL을 열어 번역 locale을 선택하고, Markdown 원문/변경 전/변경 후 전체 파일을 비교하며, 기존 리뷰 대화를 확인하고, Viewed를 표시하고, 즉시 댓글 또는 pending 댓글을 작성하고, GitHub 리뷰를 제출할 수 있어야 한다. 새로고침과 API 오류에서도 작성 내용이 안전하게 보존되고 Light/Dark 테마와 공식 검증 LTR/RTL locale이 동작해야 하며, 이 모든 기능은 별도 백엔드 없이 제공되어야 한다.

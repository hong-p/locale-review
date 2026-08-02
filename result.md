# 구현 결과

**기준일: 2026-08-03** · 브랜치 `token-guidance-classic-only`

[plan.md](./plan.md)에 정의한 범위 대비 현재 코드베이스가 무엇을 구현했고 무엇이 남았는지, 그리고 어디까지 검증됐는지를 정리한 문서입니다. 제품 소개와 사용법은 [README.md](./README.md)에 있습니다.

---

## 1. 한 줄 요약

plan.md 0~7단계의 기능이 모두 화면에서 동작하고, CI와 GitHub Pages 배포도 실제로 돌고 있습니다(<https://hong-p.github.io/locale-review/>). 남은 것은 **실제 GitHub 저장소에 대한 쓰기 검증**과 아래 §5에 적은 몇 가지 세부 항목입니다.

---

## 2. 검증 결과

### 로컬

| 명령 | 결과 |
| --- | --- |
| `npm run verify` (typecheck → lint → format 검사 → 단위 테스트 → 빌드) | 통과 |
| `npx vitest run` | **543 tests / 35 files, 전부 통과** |
| `npx playwright test` | **255 tests 전부 통과** (51개 시나리오 × chromium, firefox, webkit, mobile-chrome, mobile-safari) |
| `npm run build` 번들 크기 | JS 392.64 kB (gzip **125.07 kB**), CSS 28.14 kB (gzip 5.07 kB) |

번들 크기는 plan.md 3.10의 목표인 초기 entry gzip 200 kB 이하를 만족합니다.

### CI와 배포

| 항목 | 결과 |
| --- | --- |
| `ci.yml` | 성공. job 5개 — Checks (Node 22), Checks (Node 24), Browser tests (chromium / firefox / webkit) |
| `deploy.yml` | 성공. `main` 병합 시 품질 게이트 통과 후 Pages 배포 |
| 배포 주소 | <https://hong-p.github.io/locale-review/> (응답 확인) |

저장소 하위 경로(`/locale-review/`)에서 상대 경로 자산과 hash 라우팅이 동작한다는 것이 실제 배포로 확인됐습니다.

### 검증의 성격과 한계

- 단위·컴포넌트 테스트는 **MSW**로 GitHub API를 가로챕니다.
- 브라우저 테스트는 **Playwright 네트워크 계층**에서 GitHub 응답을 가로챕니다. 앱에는 테스트 전용 코드 경로가 없으므로, 실제로 배포되는 번들을 그대로 검증합니다.
- 따라서 **댓글 등록, 답글, 리뷰 제출, Viewed 변경이 GitHub에서 실제로 받아들여지는지는 아직 확인되지 않았습니다.** mock이 GitHub의 실제 거절 조건(권한, position 유효성, pending review 중복)까지 재현하지는 못합니다. 이것이 남은 가장 큰 검증 공백이며, 절차는 [docs/testing.md](./docs/testing.md)에 있습니다.

---

## 3. Phase별 현황

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 0 | 기반 정리, 툴체인, CI 구성 | 완료 |
| 1 | 인증, 설정, PR 불러오기 | 완료 |
| 2 | 번역 파일 발견과 데이터 모델 | 완료 |
| 3 | 전체 파일 3열 diff | 완료 (파일 목록 검색 제외) |
| 4 | Viewed와 기존 리뷰 대화 | 완료 (resolved 표시 제외) |
| 5 | 댓글 및 리뷰 제출 | 완료 (실제 PR 검증 미실시, pending 개수 표시 제외) |
| 6 | 갱신 안정성과 마무리 | 완료 (탭 상태 저장 제외) |
| 7 | GitHub Pages 배포 | 완료 (배포 동작 확인) |

---

## 4. 구현된 항목 (plan.md 조항별)

### 4.1 PR 불러오기와 탐색
- PR URL 파싱과 정규화, hash 라우팅(`#/github/:owner/:repo/pull/:number`), 직접 링크·새로고침 복원.
- 토큰이 없으면 요청을 **시작하지 않고** 안내합니다. (`src/app/screens/PullRequestScreen.tsx`)
- 구분해서 표시하는 오류 상태: 잘못된 URL, 404, 401(토큰 거부), 403(저장소 권한), rate limit + 초기화 시각, 네트워크 실패, 알 수 없는 응답.

### 4.2 번역 파일 감지 — **이번 작업에서 완성**
- 내장 레이아웃 두 가지(locale 디렉터리형, 파일명 접미사형)와 접미사 없는 Hugo 기본 언어 규칙. (`src/features/settings/translationLayout.ts`)
- **설정 화면에서 레이아웃 종류(복수 선택), 콘텐츠 루트, 확장자, 원문 locale, 접미사 포함 여부, 선호 locale을 변경할 수 있습니다.** (`src/app/screens/SettingsScreen.tsx`, `/#/settings`)
- 설정은 `localStorage`에 schema version과 함께 저장되고, 읽을 수 없거나 아무것도 매칭하지 못할 값은 폐기 후 기본값으로 되돌립니다. (`src/features/settings/translationSettings.ts`)
- 현재 입력값으로 만들어지는 경로 쌍(`content/ko/guide.md → content/en/guide.md`)을 실시간 미리보기로 보여줍니다.
- 여러 규칙에 동시에 일치하는 경로는 추측하지 않고 모호한 매핑으로 보고합니다.
- 일치하는 파일이 없으면 적용 중인 규칙과 함께 설정 링크·재시도 버튼을 제공합니다.

### 4.3 선호 locale과 PR별 필터
- 선호 locale은 설정에서 변경 가능하며 기본값은 `ko`입니다.
- PR에 존재하는 선호 locale만 자동 선택하고, 없으면 임의 선택 대신 선택을 요청합니다.
- 감지된 전체 locale과 파일 수, 필터로 숨겨진 파일 수를 표시합니다.
- 선택하지 않은 locale이 있는 상태로 Approve/Request changes를 제출하면 경고와 확인 체크박스를 요구합니다.

### 4.4 언어 및 문자 방향
- `Intl.Locale`의 방향 정보를 우선 사용하고 명시적 fallback 목록을 둡니다. (`src/features/locales/textDirection.ts`)
- 번역 본문과 그 댓글 입력 영역에만 RTL을 적용하고, UI·경로·줄번호·diff 기호는 LTR을 유지합니다.
- locale 이름 표시는 `Intl.DisplayNames`, 미지원 시 코드 자체를 사용합니다.

### 4.5 파일 상태와 내용 조회
- 수정 / 추가 / 삭제 / 이름 변경 / 원문 없음을 모두 처리합니다.
- 변경 전 기준은 `pull.base.sha`가 아니라 Compare API의 `merge_base_commit.sha`입니다.
- 포크 PR을 기본 시나리오로 지원하며, 포크가 사라진 경우 base 저장소로 재시도합니다.
- Contents API가 내용을 담아주지 않는 큰 파일은 Git blob API로 이어서 조회하고, 그래도 불가능하면 명시적 상태로 표시합니다.
- 선택한 파일만 lazy fetch하며 요청 취소와 커밋 SHA 기반 캐시 키를 사용합니다.

### 4.6 3열 diff 뷰어
- 독립 줄번호를 가진 원문 / 변경 전 / 변경 후 전체 파일 렌더링.
- 줄 단위 diff + 단어/grapheme 단위 intra-line diff(`Intl.Segmenter` 우선, fallback 있음).
- 패널 표시 토글, 변경 위치 이동, 비율 기반 스크롤 동기화, 패널 검색, `Changes only`(이 모드에서 동기화 비활성화).
- 좁은 화면에서는 세 열을 축소하지 않고 한 번에 하나씩 전환합니다.
- GitHub 댓글 position 매핑(`patchPositions.ts`)으로 댓글 가능한 라인만 활성화합니다.

### 4.7 Viewed
- GraphQL로 파일별 Viewed 조회 및 mutation, 선택한 locale 기준 진행률 표시, 거절 사유 표시.

### 4.8 기존 리뷰 대화
- 인라인 댓글과 전체 리뷰를 해당 라인에 붙여 표시하고, 라인이 사라진 댓글은 outdated로 분리해 보여줍니다.
- 답글 작성, GitHub 링크, 제출된 리뷰 본문 표시.
- 댓글 HTML은 DOMPurify로 sanitize합니다.

### 4.9 댓글과 리뷰 작성
- 단일 댓글 즉시 등록, pending 리뷰에 추가, GitHub에 이미 있는 pending 리뷰 복원 후 재사용.
- 범위 댓글(드래그 / shift-클릭), Markdown 단축 도구.
- Comment / Approve / Request changes 제출.
- 저장소 쓰기 권한이 없으면 모든 쓰기 UI를 일관되게 비활성화하고 이유를 설명합니다.

### 4.10 새로고침과 초안 보호
- 즉시 반영되는 수동 Refresh, 탭 복귀 시(Page Visibility) 새 변경 확인 배너.
- 미전송 텍스트가 있으면 다시 확인하고, 라인이 사라진 초안은 unmapped로 보존해 복사·삭제할 수 있게 합니다.
- 쓰기 실패 시 작성 내용을 지우지 않고 실패 이유를 표시합니다.

### 5장 인증과 저장소
- 기본 `sessionStorage`, 명시적 선택 시에만 `localStorage`. 전환 시 이전 사본을 삭제합니다.
- 저장된 토큰을 입력란에 다시 렌더링하지 않습니다.
- classic 토큰만 안내하며 fine-grained 토큰이 왜 안 되는지 화면에서 설명합니다.
- 레거시 `locale-review-settings` 평문 토큰 제거 마이그레이션.

### 7장 화면과 접근성
- GitHub 스타일 헤더, 파일 선택/이동 스트립, 파일 헤더, 3열 뷰어, 대화 popover, 리뷰 제출 popover.
- Light/Dark 테마(시스템 추종 + 수동), 상태를 색만으로 구분하지 않음, `prefers-reduced-motion` 존중.
- CSP를 HTML meta로 적용하고 `connect-src`를 `api.github.com`으로 제한.

---

## 5. 미구현 / 부분 구현

plan.md에 있으나 코드에 없는 항목입니다.

| # | 항목 | plan.md 근거 | 현재 상태 |
| --- | --- | --- | --- |
| 1 | 탭·PR 세션 상태 저장 | 4.3, 5.3 | 선택한 locale 필터·선택한 파일·스크롤 위치가 메모리에만 있어 새로고침하면 초기화됩니다. `sessionStorage`에 저장되는 것은 토큰과 초안뿐입니다. |
| 2 | pending 댓글 수 표시 | 7, 4.9 | 리뷰 제출 폼에 표시할 자리는 있으나 항상 `0`이 전달됩니다. (`PullRequestScreen.tsx:191`) GitHub에 저장된 pending 댓글 수를 세어 넘기지 않습니다. |
| 3 | resolved 대화 표시 | 4.8 | outdated만 표시하고 resolved 여부는 조회·표시하지 않습니다. |
| 4 | 파일 헤더의 GitHub 링크와 접기 | 7 | 경로·상태·증감 줄 수·Viewed는 있으나 파일별 GitHub 링크와 접기 기능이 없습니다. |
| 5 | 파일 목록 검색 | 4.6, 7 | 파일은 select와 이전/다음 버튼으로 고릅니다. 목록 검색 입력이 없습니다. (패널 내용 검색은 있습니다.) |
| 6 | 접근성 자동 검사 | 9 | `@axe-core/playwright`가 설치되어 있으나 이를 사용하는 테스트가 없습니다. 접근성은 수동 규칙(역할, 레이블, 색 외 신호)으로만 확보되어 있습니다. |
| 7 | 키보드 단축키 | 6단계 4 | 모든 제어는 기본 포커스 이동으로 조작 가능하지만 diff 탐색용 전용 단축키는 없습니다. |

※ 다음 항목은 plan.md 11장에서 **의도적으로 제외**한 범위이므로 미구현이 아닙니다: 임의 정규식/매핑 편집기, 번역 메모리·용어집, 자동 번역 제안, GitHub 외 호스트, 다국어 UI.

---

## 6. 검증되지 않은 것

| 항목 | 이유 | 필요한 것 |
| --- | --- | --- |
| **실제 GitHub 쓰기** | 댓글·답글·리뷰 제출·Viewed가 모두 mock으로만 검증됨 | 전용 테스트 저장소와 테스트 PR에서 [docs/testing.md](./docs/testing.md)의 절차 수행 |
| rate limit 실동작 | mock 헤더로만 검증 | 실제 한도 초과 상황 관찰 (선택) |
| 포크 저장소 삭제 fallback | 4.5의 fallback 경로를 mock으로만 검증 | 포크가 삭제된 실제 PR 관찰 (선택) |

---

## 7. 이번 작업에서 추가·변경된 파일

번역 파일 원문 경로 설정(plan.md 1단계 3번, 4.2, 4.3, 5.3)을 구현했습니다. 이전에는 `DEFAULT_LAYOUT` 상수가 코드에 고정되어 있어 `content/{locale}/*.md`, 원문 `en`, 선호 locale `ko` 이외의 저장소는 사용할 수 없었습니다.

**추가**

- `src/features/settings/translationSettings.ts` — 설정 타입, 기본값, 정규화, 저장 slot, 경로 예시 생성
- `src/features/settings/TranslationSettingsContext.tsx` — provider와 hook
- `src/app/screens/SettingsScreen.tsx` / `.module.css` — 설정 화면
- `src/features/settings/translationSettings.test.ts` — 순수 함수와 저장소 테스트
- `src/app/screens/SettingsScreen.test.tsx` — 설정 폼 테스트
- `e2e/settings.spec.ts` — 설정 변경이 실제 조회 경로를 바꾸는지 브라우저에서 검증

**변경**

- `src/app/routes.tsx` — `/settings` 라우트 추가
- `src/app/App.tsx` — provider 추가
- `src/app/screens/StartScreen.tsx`, `PullRequestScreen.tsx` — 설정 진입 링크
- `src/features/files/TranslationFileBrowser.tsx` — 고정 상수 대신 저장된 설정 사용, 파일 없음 화면에 설정 링크와 재시도 추가
- `src/messages/en.ts` — 설정 화면 문구
- 기존 테스트 4개 파일 — provider/router wrapper 반영

---

## 8. 다음 할 일 (권장 순서)

1. 전용 테스트 저장소에서 실제 쓰기 흐름을 검증합니다. 남은 유일한 큰 공백입니다. (§6)
2. §5의 1번(탭 상태 저장)과 2번(pending 댓글 수)을 구현합니다. 사용자가 가장 먼저 체감하는 두 항목입니다.
3. §5의 6번(axe 검사)을 브라우저 테스트에 추가합니다.
4. §5의 3~5번(resolved 표시, 파일 헤더 링크·접기, 파일 목록 검색)을 정리합니다.

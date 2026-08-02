# Locale Review

번역 PR을 원문 / 변경 전 번역 / 변경 후 번역 3열로 비교하며 검토하는 **정적 웹앱**입니다. 서버, 데이터베이스, 런타임 API가 없습니다. 브라우저가 GitHub API를 직접 호출하고 결과물은 GitHub Pages 같은 정적 호스팅에 그대로 올릴 수 있습니다.

## 현재 상태

**모든 Phase의 구현이 끝났습니다.** 토큰 설정부터 PR 조회, 번역 파일 감지, locale 필터, 3열 diff, Viewed, 기존 리뷰 대화, 답글, 리뷰 제출, 새로고침 보호까지 화면에서 동작합니다.

아직 확인되지 않은 것이 두 가지 있습니다.

- **실제 GitHub 쓰기 검증** — 모든 쓰기 흐름은 MSW mock으로만 검증됐습니다. [docs/testing.md](./docs/testing.md)의 절차에 따라 전용 테스트 저장소에서 수동 확인이 필요합니다.
- **CI와 배포 실행** — 워크플로는 준비됐지만 git remote가 없어 한 번도 실행되지 않았습니다. 전체 범위와 진행 순서는 [plan.md](./plan.md)에 정의되어 있습니다.

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 0 | 기반 정리, 툴체인, CI | 완료 |
| 1 | 인증, 설정, PR 불러오기 | 완료 |
| 2 | 번역 파일 발견과 데이터 모델 | 완료 |
| 3 | 전체 파일 3열 diff | 완료 |
| 4 | Viewed와 기존 리뷰 대화 | 완료 |
| 5 | 댓글 및 리뷰 제출 | 완료 (실제 PR 검증 미실시) |
| 6 | 갱신 안정성과 마무리 | 완료 |
| 7 | GitHub Pages 배포 | 완료 (미실행) |

## 개발 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

## 검증

```bash
npm run verify    # typecheck, lint, format, 단위 테스트, 빌드
npm run test:e2e  # Playwright 브라우저 테스트
```

브라우저 테스트는 처음 한 번 바이너리 설치가 필요합니다.

```bash
npx playwright install --with-deps chromium firefox webkit
```

자세한 테스트 계층과 픽스처 규칙은 [docs/testing.md](./docs/testing.md)를 참고하세요.

## 정적 페이지 만들기

```bash
npm run build
npm run preview
```

빌드 결과는 `dist/`에 생성됩니다. 모든 리소스 경로가 상대 경로이고 hash 라우팅을 사용하므로 저장소 하위 경로에서도 동작합니다.

## 토큰과 보안

- GitHub 토큰이 있어야 PR을 열 수 있습니다. 인증 없는 요청은 보내지 않습니다.
- 토큰은 기본적으로 `sessionStorage`에만 저장하며, 사용자가 명시적으로 선택한 경우에만 `localStorage`에 남깁니다.
- `public_repo` 스코프를 가진 **classic PAT**가 필요합니다. GitHub은 fine-grained 토큰을 본인 소유가 아닌 공개 저장소에서 항상 읽기 전용으로 취급하므로, 남의 번역 PR에 댓글·리뷰·Viewed를 남길 수 없습니다.
- classic PAT는 계정의 모든 공개 저장소에 쓰기 권한을 줍니다. 만료 기간을 짧게 잡으세요.
- 토큰은 브라우저 origin별로 따로 저장됩니다. 로컬 개발 서버와 배포된 주소는 서로 다른 토큰을 가집니다.
- 외부 분석 도구, 광고, 원격 스크립트를 사용하지 않으며 토큰은 GitHub API origin으로만 전송합니다.

프로토타입을 실행했던 브라우저에는 `locale-review-settings`에 평문 토큰이 남아 있을 수 있습니다. 앱을 처음 실행할 때 이 항목을 자동으로 삭제합니다.

## 문서

- [plan.md](./plan.md) — 제품 범위, 기술 결정, 단계별 구현 계획
- [docs/testing.md](./docs/testing.md) — 테스트 절차와 실제 GitHub 쓰기 검증 규칙
- [docs/deployment.md](./docs/deployment.md) — GitHub Pages 설정, CSP 한계, 토큰 저장의 실제 위험

코드와 UI 문구는 영어, 계획 및 협업 문서는 한국어를 사용합니다.

# Locale Review

번역 PR을 원문 / 변경 전 번역 / 변경 후 번역 3열로 비교하며 검토하는 **정적 웹앱**입니다. 서버, 데이터베이스, 런타임 API가 없습니다. 브라우저가 GitHub API를 직접 호출하고 결과물은 GitHub Pages 같은 정적 호스팅에 그대로 올릴 수 있습니다.

## 현재 상태

**개발 중입니다.** 토큰 설정, PR 조회, 번역 파일 감지, locale 필터, 3열 diff 비교까지 동작합니다. 댓글과 리뷰 제출은 아직 구현되지 않았습니다. 전체 범위와 진행 순서는 [plan.md](./plan.md)에 정의되어 있습니다.

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 0 | 기반 정리, 툴체인, CI | 완료 |
| 1 | 인증, 설정, PR 불러오기 | 완료 |
| 2 | 번역 파일 발견과 데이터 모델 | 완료 |
| 3 | 전체 파일 3열 diff | 완료 |
| 4 | Viewed와 기존 리뷰 대화 | 다음 |
| 5 | 댓글 및 리뷰 제출 | 예정 |
| 6 | 갱신 안정성과 마무리 | 예정 |
| 7 | GitHub Pages 배포 | 예정 |

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
- 저장소 범위를 제한하고 만료 기간이 짧은 Fine-grained PAT 사용을 권장합니다.
- 외부 분석 도구, 광고, 원격 스크립트를 사용하지 않으며 토큰은 GitHub API origin으로만 전송합니다.

프로토타입을 실행했던 브라우저에는 `locale-review-settings`에 평문 토큰이 남아 있을 수 있습니다. 앱을 처음 실행할 때 이 항목을 자동으로 삭제합니다.

## 문서

- [plan.md](./plan.md) — 제품 범위, 기술 결정, 단계별 구현 계획
- [docs/testing.md](./docs/testing.md) — 테스트 절차와 실제 GitHub 쓰기 검증 규칙

코드와 UI 문구는 영어, 계획 및 협업 문서는 한국어를 사용합니다.

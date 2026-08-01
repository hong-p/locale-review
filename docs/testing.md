# 테스트 절차

plan.md 9의 테스트 전략을 실행하는 방법을 정리한다. 코드와 UI 문구는 영어, 이 문서는 한국어를 사용한다(plan.md 8단계 0 항목 6).

## 게이트 명령

Phase를 완료하려면 아래가 모두 성공해야 한다(plan.md 8).

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run build
```

`npm run verify`는 브라우저 테스트를 제외한 나머지를 한 번에 실행한다. 브라우저 테스트는 실행 시간이 길어 별도로 둔다.

처음 한 번은 브라우저 바이너리를 설치해야 한다.

```bash
npx playwright install --with-deps chromium firefox webkit
```

## 계층

| 계층 | 도구 | 위치 | 대상 |
| --- | --- | --- | --- |
| 단위 | Vitest | `src/**/*.test.ts` | 순수 함수: 경로 매핑, diff, 저장소 파싱, 오류 표준화 |
| 컴포넌트 | Vitest + Testing Library | `src/**/*.test.tsx` | 상태별 화면 동작, 접근성 이름, 테마 |
| 브라우저 | Playwright | `e2e/*.spec.ts` | 실제 정적 빌드에서의 사용자 흐름 |

브라우저 테스트는 앱에 목 코드를 넣지 않는다. `e2e/support/github.ts`가 Playwright의 `page.route`로 GitHub API를 네트워크 계층에서 가로채므로, **배포되는 것과 동일한 번들**이 실행된다.

jsdom이 답할 수 없는 것이 브라우저 테스트의 존재 이유다.

- 3열 그리드가 실제로 3열인지 (bounding box 비교)
- 비율 기반 스크롤 동기화 — jsdom은 `scrollHeight`를 항상 0으로 보고한다
- 900px 미디어 쿼리에 따른 패널 전환
- RTL에서 줄번호가 왼쪽에 남는지

## GitHub API 모킹

모든 GitHub 요청은 MSW로 가로챈다. 공유 서버는 `src/test/msw/server.ts`에 있고 기본 핸들러는 `src/test/msw/handlers.ts`에 둔다.

- 기본 핸들러 목록은 의도적으로 비어 있다. 각 Phase가 필요한 핸들러만 추가한다.
- 테스트 한 건에만 필요한 응답은 공유 목록에 넣지 말고 해당 테스트에서 `server.use(...)`로 덮는다.
- `onUnhandledRequest: "error"` 설정 때문에 핸들러가 없는 요청은 네트워크로 나가지 않고 테스트가 실패한다. 이는 의도된 동작이다.

### 픽스처 준비 원칙

- 실제 GitHub 응답을 한 번 받아 익명화한 뒤 고정 픽스처로 저장한다. 매번 실시간 호출하지 않는다.
- 픽스처에는 토큰, 실명, 사설 저장소 경로를 남기지 않는다.
- 다음 상황을 픽스처로 확보한다: 동일 저장소 PR, 포크 PR, 삭제된 포크, patch가 없는 대용량 파일, 3,000개 파일 상한, rate limit 초과, 권한 부족, GraphQL 오류.

## 실제 GitHub 쓰기 검증

자동 테스트는 **절대** 실제 저장소에 댓글이나 리뷰를 등록하지 않는다(plan.md 9). 쓰기 흐름의 실제 연동 확인은 아래 절차로만 수행한다.

1. 사용자가 전용 테스트 저장소와 테스트 PR을 준비한다. 이 저장소는 이 프로젝트 검증 외의 용도로 쓰지 않는다.
2. 저장소 생성과 실제 쓰기 실행은 사전에 사용자 승인을 받는다(plan.md 8단계 0 항목 1).
3. 검증에는 해당 저장소로만 범위를 제한한 Fine-grained PAT를 사용하고, 짧은 만료 기간을 설정한다.
4. 확인 대상: 즉시 댓글, pending review 생성·재사용·제출, 답글, Viewed 설정과 해제, 중복 등록이 발생하지 않는지 여부.
5. 검증이 끝나면 사용한 토큰을 폐기한다.
6. 결과는 Phase 5 완료 기록에 남긴다.

CI는 이 절차를 실행하지 않는다. CI의 mutation 검증은 MSW 픽스처로만 이루어진다.

## CI

`.github/workflows/ci.yml`이 push와 pull request에서 실행된다.

- `checks` job: typecheck, lint, format:check, 단위 테스트, 빌드, 번들 크기 기록
- `browser` job: Chromium/Firefox/WebKit 병렬 실행. `checks` 통과 후에만 시작한다.

브라우저 테스트가 실패하면 `playwright-report` 아티팩트가 업로드된다.

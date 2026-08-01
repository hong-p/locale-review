# 배포

GitHub Pages에 정적 사이트로 배포한다. 서버가 없으므로 빌드 산출물 `dist/`를 그대로 올린다.

## 저장소에서 한 번만 하는 설정

1. **Settings → Pages → Build and deployment → Source**를 `GitHub Actions`로 변경한다. `Deploy from a branch`가 아니다.
2. **Settings → Actions → General → Workflow permissions**에서 Actions가 실행될 수 있는지 확인한다.
3. 처음 배포가 끝나면 **Settings → Pages**에 표시되는 URL에서 **Enforce HTTPS**가 켜져 있는지 확인한다. 기본으로 켜져 있으며, plan.md 10이 HTTPS 제공을 요구한다.

`.github/workflows/deploy.yml`이 `permissions`에 `pages: write`와 `id-token: write`를 선언하므로 별도 토큰이나 시크릿을 만들 필요가 없다.

## 배포 흐름

`main`에 push되면 세 단계가 순서대로 실행된다.

1. **gate** — typecheck, lint, format, 단위 테스트, 빌드, Chromium 브라우저 테스트. 하나라도 실패하면 배포하지 않는다.
2. **build** — `npm run build` 후 `dist/`를 Pages 아티팩트로 업로드한다.
3. **deploy** — 아티팩트를 게시한다.

`workflow_dispatch`로 수동 실행할 수도 있다.

## 하위 경로에서 동작하는 이유

`https://<user>.github.io/<repo>/` 처럼 저장소 하위 경로로 서빙되어도 별도 빌드 설정이 필요 없다.

- `vite.config.ts`의 `base: "./"` — 모든 자산 경로가 상대 경로로 생성된다.
- React Router의 `HashRouter` — 경로가 `#` 뒤에 있으므로 서버 rewrite가 필요 없다. GitHub Pages는 rewrite를 제공하지 않는다.

커스텀 도메인을 루트에 붙이는 경우에도 같은 산출물이 그대로 동작한다.

## Content Security Policy의 한계

CSP는 `index.html`의 `<meta http-equiv>`로 전달한다. **GitHub Pages는 임의 응답 헤더를 설정할 수 없기 때문이다.**

meta 형식에서는 다음 지시어를 사용할 수 없다.

| 지시어 | 상태 | 영향 |
| --- | --- | --- |
| `frame-ancestors` | 사용 불가 | 다른 사이트가 이 앱을 iframe으로 감싸는 것을 CSP로 막을 수 없다 |
| `report-uri` / `report-to` | 사용 불가 | 위반 리포트를 수집할 수 없다 |
| `sandbox` | 사용 불가 | — |

`frame-ancestors`가 없다는 점은 실질적인 제약이다. 응답 헤더를 설정할 수 있는 호스팅(Cloudflare Pages, Nginx 등)에 배포한다면 헤더로 `frame-ancestors 'none'`과 `X-Frame-Options: DENY`를 추가하는 것이 좋다.

### 현재 정책

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://avatars.githubusercontent.com;
font-src 'self';
connect-src 'self' https://api.github.com;
form-action 'none';
base-uri 'none';
object-src 'none';
manifest-src 'self'
```

- `connect-src`가 `api.github.com` 하나뿐이다. 코드에 버그가 있어도 토큰이 다른 origin으로 나갈 수 없다.
- `img-src`에 `*.githubusercontent.com`이 없다. 리뷰 댓글의 이미지는 표시하지 않고 링크로 치환하기 때문이다(plan.md 4.8). 아바타 origin만 필요하다.
- `style-src`의 `'unsafe-inline'`은 Vite가 스타일시트를 주입하고 React가 패널 열 개수를 인라인 커스텀 속성으로 전달하기 때문에 필요하다.

## 토큰 저장에 대한 정직한 설명

이 앱은 백엔드가 없으므로 토큰은 브라우저에만 존재한다.

- 기본값은 `sessionStorage`이며 탭을 닫으면 사라진다.
- 사용자가 명시적으로 선택하면 `localStorage`에 저장된다.
- **XSS가 발생하면 두 저장소 모두 노출된다.** 세션 저장은 노출 시간을 줄이는 수단이지 XSS 방어책이 아니다. 이 점은 사용자 문서에도 명시한다(plan.md 10).
- 그래서 이 앱은 외부 스크립트를 전혀 로드하지 않고, 댓글 HTML을 DOMPurify로 다시 정제하며, CSP `script-src`를 `'self'`로 제한한다. XSS 표면을 줄이는 것이 유일한 실질적 방어다.

저장소 범위를 제한하고 만료가 짧은 Fine-grained PAT 사용을 권장하는 이유이기도 하다. 유출되더라도 피해 범위와 기간이 제한된다.

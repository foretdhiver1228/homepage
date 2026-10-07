# 방명록·비밀글·배너 교류 설정 — v0.3

## 업데이트 순서

GitHub에 이전 버전을 올렸다면 이번 ZIP의 소스 파일로 덮어씁니다.
기존 `.env`는 유지합니다. 새 SQL로 기존 글 데이터를 지우지 않습니다.
이미 `schema.sql`을 실행했다면 다시 실행하지 말고, SQL Editor에서
`supabase/002_guestbook_links.sql`만 한 번 실행하세요.
새 프로젝트라면 `schema.sql` → 집주인 등록 → `002_guestbook_links.sql` 순서입니다.
이미 v0.2 SQL을 실행했다면 SQL 재실행은 필요 없습니다. 이번 서버 함수와 프런트엔드를 다시 배포하고 아래 Turnstile 설정을 추가합니다.

## 방문자 확인 설정 — 로그인·방명록에 필수

1. Cloudflare 대시보드 → Turnstile에서 위젯을 생성합니다. Managed 모드를 선택하고 실제 홈페이지 hostname을 등록합니다. 주소 경로는 넣지 않습니다.
2. 운영용 위젯에는 운영 도메인만 등록하세요. 로컬 개발이 필요하면 별도 개발 위젯에 `localhost`를 등록하고 별도 테스트 Supabase 프로젝트와 함께 사용하세요.
3. **Site key**는 `.env`와 Cloudflare Pages 빌드 환경변수의 `VITE_TURNSTILE_SITE_KEY`에 넣습니다. 공개되는 값입니다.
4. **Secret key**는 아래 서버 Secrets의 `HOME_TURNSTILE_SECRET_KEY`에 넣습니다. 브라우저 환경변수에 넣지 않습니다.
5. 같은 Secret key를 Supabase → Authentication 설정 → Bot and Abuse Protection에서 CAPTCHA 제공자 Turnstile로 등록하고 Enable CAPTCHA protection을 켭니다. 메뉴 위치는 대시보드 개편에 따라 달라질 수 있습니다.
6. 프런트엔드와 방명록 함수를 다시 배포합니다.

관리자 로그인 토큰은 Supabase Auth가 검증합니다. 이 대시보드 설정을 끄면 UI를 우회한 Auth API 요청에는 CAPTCHA가 강제되지 않으므로 반드시 켜세요.
방명록 작성·비밀글 조회는 Edge Function에서 Siteverify API를 직접 호출하고 성공 여부, `action`, 허용된 `hostname`을 모두 검사합니다.
토큰은 5분간 유효하고 일회용입니다. 검증 실패·키 누락·검증 서비스 장애 때는 작성·비밀글 조회를 거절합니다.
키가 없으면 운영 모드의 로그인·방명록 제출 버튼은 비활성화됩니다. 공개 목록과 로컬 샘플 체험은 계속 사용할 수 있습니다.
테스트용 항상 성공하는 키는 운영 사이트에 사용하지 마세요.

## 비밀 방명록의 의미

- 방문자는 회원가입 없이 공개 또는 비밀 방명록을 남깁니다.
- 비밀글은 작성 시 정한 12자 이상 비밀번호로 본문·집주인 답글을 다시 읽습니다.
- 닉네임·홈페이지 주소·작성일·비밀글 여부는 공개 목록에 표시됩니다.
- 본문과 답글은 서버에서 AES-256-GCM으로 암호화한 뒤 DB에 저장합니다.
- 글마다 새로운 96비트 IV를 생성하고 글 UUID를 AAD로 묶어 암호문 바꿔치기를 검사합니다.
- 비밀번호는 PBKDF2-HMAC-SHA-256 600,000회와 무작위 salt로 저장합니다. 평문 비밀번호는 저장하지 않습니다.
- 암호화 키는 Supabase Edge Function Secrets에만 둡니다. 브라우저 코드나 GitHub에 넣지 않습니다.
- 집주인은 Supabase 로그인 JWT를 서버에서 검증하고 `home_admins` 회원인지 확인한 후 조회합니다.
- 로그인 JWT가 유효해도 집주인으로 등록되지 않은 사용자는 관리자 작업을 할 수 없습니다.
- 방문자 비밀번호를 잊으면 작성자 조회는 복구되지 않습니다. 집주인은 계속 조회할 수 있습니다.
- 이 구조는 집주인/서버가 복호화 가능한 암호화이며 종단간 암호화는 아닙니다.

## 서버 함수 배포

이 기능은 AES 키를 브라우저에 노출하지 않기 위해 작은 서버 함수가 필요합니다.
별도의 AWS 서버 대신 Supabase Edge Function을 사용합니다. 함수 런타임은 Deno입니다.
프런트엔드 개발·빌드는 기존대로 Node.js를 사용합니다.

### A. 먼저 서버 Secrets 설정

Supabase 프로젝트 → Edge Functions → Secrets에서 아래 값을 등록합니다.

| 이름 | 값 |
|---|---|
| `HOME_ENCRYPTION_KEY` | 무작위 32바이트의 Base64 문자열 |
| `HOME_ALLOWED_ORIGINS` | 허용할 홈페이지 origin들을 쉼표로 연결 |
| `HOME_SUPABASE_SECRET_KEY` | 프로젝트 API Keys의 서버용 `sb_secret_...` 키 |
| `HOME_TURNSTILE_SECRET_KEY` | 위 Turnstile 위젯의 Secret key |

운영 `HOME_ALLOWED_ORIGINS` 예: `https://내프로젝트.pages.dev,https://내도메인.com`
origin에는 `/`로 끝나는 경로나 `/#guestbook`을 넣지 않습니다. 실제 dev 포트에 맞춰 적습니다.
배포 주소가 추가되면 이 값과 Turnstile 허용 hostname 모두에 추가하세요. 원격 preview 주소는 개별적으로 허용해야 합니다.
로컬 개발용 함수는 별도 테스트 프로젝트에서 `http://localhost:5173`을 허용합니다. 운영 설정에 개발 주소를 남겨두지 마세요.

키 생성은 내 컴퓨터 터미널에서 아래를 한 번 실행하고 결과를 Secrets에 넣습니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

생성한 암호화 키는 비밀번호 관리자 등에 별도로 보관하세요. 이 키를 잃으면 기존 비밀글을 복호화할 수 없습니다.
기존 비밀글이 있는 상태에서 키만 새 값으로 바꾸면 복호화되지 않습니다. 키 교체는 기존 데이터를 재암호화하는 별도 작업이 필요합니다.
`HOME_` 값은 프런트엔드 `.env`나 Cloudflare 빌드 환경변수에 넣지 않습니다.
`VITE_HOME_ENCRYPTION_KEY`처럼 VITE_ 접두사를 붙이면 브라우저에 노출되므로 사용하지 마세요.
서버 키를 따로 등록하지 않으면 Supabase 기본 `SUPABASE_SERVICE_ROLE_KEY`를 사용할 수 있지만 신규 구성은 위 서버용 키를 권장합니다.

### B. 배포 방법 1 — Dashboard Editor

1. Edge Functions → Deploy a new function → Via Editor를 엽니다.
2. 함수 이름을 `guestbook`으로 정합니다.
3. `supabase/functions/guestbook/index.ts`를 메인 파일에 넣습니다.
4. 같은 함수에 `crypto.ts` 파일을 추가하고 `supabase/functions/guestbook/crypto.ts` 내용을 넣습니다.
5. 익명 방문자 요청을 받으므로 함수의 플랫폼 `Verify JWT` 설정은 끕니다.
6. Deploy function을 누릅니다. 관리자 작업의 JWT·집주인 검사는 함수 코드 안에서 계속 수행됩니다.

### 배포 방법 2 — Supabase CLI

Supabase CLI가 준비되어 있다면 프로젝트 루트에서 아래를 실행합니다.

```bash
npx supabase login
npx supabase functions deploy guestbook --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
```

`YOUR_PROJECT_REF`는 프로젝트 URL에서 `https://`와 `.supabase.co` 사이 부분입니다.
`supabase/config.toml`에도 익명 요청을 위한 `verify_jwt = false` 설정을 포함했습니다.
로컬 함수 테스트에는 Docker 등이 필요할 수 있으나 위 원격 API 배포는 별도 Docker 없이 사용할 수 있습니다.

## 확인

1. 공개 방명록이 목록에 나타나는지 확인합니다.
2. 비밀글을 작성하고 시크릿 창에서 목록 응답(JSON)에도 본문·답글이 없는지 확인합니다.
3. 잘못된 비밀번호는 거절되고, 올바른 비밀번호는 내용이 열리는지 확인합니다.
4. 집주인으로 로그인 → 방명록 관리에서 비밀글 확인·답글 등록·삭제를 확인합니다.
5. 작성자가 같은 비밀번호로 집주인 비밀 답글을 볼 수 있는지 확인합니다.
6. 비로그인/집주인이 아닌 계정의 `backup`, `reply`, `delete`, `admin_list` 요청이 거절되는지 확인합니다.
7. DB의 비밀글 행에서는 `body`·`reply`가 null이고 `encrypted_payload`만 저장되는지 확인합니다.
8. DB REST API로 `guestbook`·`guestbook_rate_limits`를 브라우저 공개키/사용자 JWT로 직접 조회·변경할 수 없는지 확인합니다.
9. `captcha_token`을 빼거나 위조하거나 재사용한 작성·비밀글 조회 요청이 거절되는지 확인합니다.
10. Supabase Auth 로그인 API도 CAPTCHA 토큰 없이 로그인할 수 없는지 확인합니다. 대시보드 CAPTCHA 설정이 필요합니다.

`npm run test:security`는 로컬 암호화 및 HTTP 핸들러 보안 검사를 실행합니다.
실제 Supabase Auth·PostgreSQL·Turnstile을 대체하는 테스트 응답을 사용합니다.
따라서 실제 배포의 JWT/RLS/CAPTCHA/IP 헤더 설정은 위 순서로 별도 확인해야 합니다.
이 작업에서는 실제 Supabase 계정 연결 및 브라우저 시각 검증을 수행하지 않았습니다.

요청 제한은 DB에서 원자적으로 카운트합니다. 현재 기본 제한은 다음과 같습니다.
- IP 그룹당 방명록 등록: 시간당 4회, 전체 등록: 하루 200회
- 비밀글 조회: IP 그룹+글당 10분에 5회, IP 그룹당 시간당 30회
- 특정 글 전체 조회: 시간당 100회, 전체 비밀글 조회: 하루 2,000회
IP는 게이트웨이가 전달한 헤더를 서버 키 HMAC으로 처리하여 원문을 제한 테이블에 저장하지 않습니다.
프록시 환경의 IP 헤더를 실제 배포에서 확인하세요. 공유 IP 사용자는 제한을 함께 적용받을 수 있습니다.
Origin/IP 헤더만으로 방문자 신원을 증명하지 않습니다. 헤더가 위조될 가능성에 대비해 서버 검증 CAPTCHA와 글 전체·사이트 전체 제한을 함께 적용합니다.
요청 제한은 서비스 거부 공격을 완전히 막지 못합니다. 반복 공격 시 함수 호출량도 확인하고 게이트웨이 차단·요금 제한을 별도로 구성하세요.
오래된 제한 기록은 SQL Editor에서 주기적으로 정리할 수 있습니다.

```sql
delete from public.guestbook_rate_limits where window_start < now() - interval '2 days';
```

## 전체 JSON 백업

집주인 책상 → 전체 JSON 백업에는 다음을 넣습니다.

- 일기·소설·그림 게시물: 공개·비공개·임시저장 포함
- 방명록 전체: 공개·비밀 본문과 집주인 답글 포함
- 이웃 홈페이지 링크
- 사이트 소개 설정과 내보내기 시각·포맷 버전

비밀 방명록은 읽을 수 있는 평문으로 내보냅니다. 비밀번호 해시·salt·서버 암호화 키는 포함하지 않습니다.
백업 파일 자체에는 별도 암호화를 하지 않으므로 비밀 문서처럼 보관하세요.
그림 바이너리는 포함하지 않습니다. Storage 파일은 별도로 백업합니다.
자동 복원 UI는 아직 없으며, JSON은 데이터 보관·이전용입니다. 계정 비밀번호와 Edge Function Secrets는 별도 관리합니다.
한 비밀글이라도 복호화되지 않으면 전체 방명록 백업을 실패로 처리하여 누락을 숨기지 않습니다.
관리 화면은 최신 200개를 표시하지만 전체 백업은 페이지를 나눠 전체 방명록을 가져옵니다.

## 배너 교류

`public/banner.svg`는 200×40, `public/banner-small.svg`는 88×31 SVG 배너입니다.
사이트 이름을 변경하면 SVG 안의 제목·텍스트도 수정해 주세요.
상대 홈페이지에서 SVG 업로드를 받지 않는 경우 PNG로 변환한 파일을 교환하면 됩니다.

- 이웃 홈페이지 메뉴에서 내 배너 이미지 URL과 링크 HTML을 복사하거나 배너 파일을 내려받을 수 있습니다.
- 집주인 책상 → 이웃 관리에서 상대 홈페이지 이름·주소·배너 URL을 등록합니다.
- 홈페이지 주소는 https://만 허용합니다. 상대 배너가 없으면 이름·소개만 표시됩니다.
- `.env`와 Cloudflare 빌드 설정의 `VITE_PUBLIC_SITE_URL`에 실제 공개 홈페이지 주소를 넣으면 복사할 링크가 고정됩니다.
- 상대가 내 배너 URL을 자신의 홈에 넣으면, 그 방문자 브라우저가 내 Cloudflare 정적 배너 파일을 요청합니다.
- 상대가 배너를 내려받아 자신의 호스팅에 올리면 이미지 전송은 상대 호스팅이 담당합니다.
- 내 배너는 Supabase 파일 저장소를 사용하지 않습니다. Cloudflare Pages의 정적 파일로 배포됩니다.
- 이웃 배너 이미지는 상대 서버에서 직접 로드합니다. 상대 사이트가 외부 이미지 링크를 허용하는지 확인합니다.
- 배너 요청은 해당 홈페이지 실제 방문 수와 다릅니다. 배너를 본 사람이 클릭해야 방문으로 연결됩니다.

참고:
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/auth-headers
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://supabase.com/docs/guides/auth/auth-captcha

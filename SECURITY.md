# 보안 설정과 검증 — v0.3

이 프로젝트는 개인 홈페이지의 기본 보호 장치를 갖춘 시작용 소스입니다.
취약점이 없다는 보증이나 외부 보안 심사 통과 인증을 제공하지 않습니다.

## 보호 범위

| 대상 | 적용한 보호 |
|---|---|
| 비공개 게시물·임시저장 | PostgreSQL RLS, 집주인 등록 확인 |
| 비공개 이미지 | private Storage, 소유자 정책, 10분 유효 signed URL |
| 비밀 방명록 본문·답글 | 서버 AES-256-GCM, 무작위 IV, 글 ID 결합 무결성 검사 |
| 작성자 비밀번호 | salt + PBKDF2-SHA-256 600,000회, 원문 미저장 |
| 관리자 방명록·백업 | 서버에서 Auth JWT 검증 후 home_admins 확인 |
| 봇 작성·비밀번호 추측 | 서버 Turnstile 검증, DB 원자적 요청 제한 |
| 관리자 로그인 | Turnstile 토큰 전달, Supabase Auth CAPTCHA 설정 필요 |
| 악성 본문 | React 텍스트 출력, HTML 삽입·실행 기능 없음 |
| 업로드 | 집주인만 허용, JPG/PNG/WebP, private bucket 5MB 제한 |
| 브라우저 | CSP, frame 차단, nosniff, HSTS, 권한 제한 헤더 |
| 키 관리 | 공개 publishable key만 프런트엔드, 서버 키·AES 키는 Secrets |

HSTS·CSP 등은 Cloudflare Pages가 `public/_headers`를 배포 응답에 적용해야 작동합니다.
다른 호스팅으로 옮기면 헤더를 해당 서비스 방식으로 설정해야 합니다.
HTTPS 강제 설정도 확인하세요. HSTS는 해당 호스트의 HTTPS를 강제하며 자동으로 모든 하위 도메인에 적용하지 않습니다.
외부 이웃 배너 때문에 HTTPS 이미지 출처는 넓게 허용합니다. 배너는 img로 표시하고 외부 HTML을 삽입하지 않습니다.

## 확인한 결과 — 2026-10-07

- `npm audit --json`: 현재 잠금 파일의 알려진 의존성 취약점 0건. 새 공지가 나오면 결과가 달라질 수 있습니다.
- `npm run build`: 프런트엔드 TypeScript 검사와 운영 빌드 통과.
- `npm run test:security`: 암호문 변조·글 ID 변경·다른 키 복호화 실패, 비밀번호 검증, 비밀글 목록 누출 방지, 비관리자 백업·답글·삭제 거절, 전체 백업, 요청 제한, 허용 origin·URL 검사 통과.
- 위 테스트는 CAPTCHA 토큰 누락·위조·용도 불일치·hostname 불일치·재사용·검증 서비스 장애의 거절도 검사합니다.
- Edge Function의 별도 TypeScript 정적 검사 통과. 실제 Deno 배포 실행 검증은 아닙니다.

Auth·DB·Turnstile은 로컬 테스트에서 모의 응답을 사용했습니다.
실제 Supabase RLS, 네트워크 게이트웨이, CAPTCHA 제공자, 모바일/PC 브라우저를 통한 통합 검증 및 외부 침투 테스트는 수행하지 않았습니다.

## 공개 배포 전 확인

1. `README.md`와 `GUESTBOOK_SETUP.md`의 설정 및 실제 프로젝트 권한 검증을 완료합니다. UI에 버튼이 없다는 이유만으로 권한이 안전하다고 판단하지 않습니다. REST API 직접 요청도 검사합니다.
2. 운영 빌드에 `.env`, 서버 키, AES 키, 비밀번호, 개인 백업 JSON이 포함되지 않았는지 확인합니다. `VITE_` 값은 누구나 볼 수 있습니다.
3. Supabase의 공개 회원가입·익명 로그인을 끄고 집주인만 `home_admins`에 등록합니다. Auth CAPTCHA를 활성화합니다.
4. 집주인 비밀번호는 비밀번호 관리자에서 생성한 충분히 긴 고유 비밀번호로 설정합니다. GitHub·Cloudflare·Supabase 관리 계정에도 2단계 인증을 설정합니다.
5. 시크릿 창과 집주인이 아닌 계정으로 비공개 글 조회, 파일 signed URL 신규 발급, 글 변경, 방명록 테이블 직접 접근, 관리자 백업을 검사합니다.
6. 실제 HTTPS 응답에서 `_headers`가 적용되고, 브라우저 개발자 도구에서 CSP 오류 없이 폰트·Turnstile·그림이 표시되는지 확인합니다.

## 운영 시 알아둘 점

- AES는 서버가 복호화할 수 있는 저장 암호화입니다. 서버 권한과 키가 함께 탈취되면 보호할 수 없습니다.
- 방명록 비밀번호를 아는 사람은 작성자로 조회할 수 있습니다. 생년월일·닉네임 등 추측 가능한 비밀번호 대신 고유한 긴 문구를 사용하세요.
- 앱 집주인 로그인 자체에는 아직 TOTP/패스키 2단계 인증 UI와 서버 강제 정책이 없습니다. 이를 추가할 때는 UI와 모든 RLS·서버 권한 검사에서 AAL2를 함께 강제해야 합니다.
- 공개 글을 비공개로 바꾸어도 이미 발급된 이미지 URL은 최대 10분간 유효하며, 이미 저장된 파일을 회수할 수는 없습니다.
- 전체 JSON 백업은 비공개 글·비밀 방명록의 평문을 포함합니다. 암호화된 개인 저장소에 보관하고 공개 저장소에 올리지 않습니다. Storage 바이너리와 AES 키는 별도 백업합니다.
- 의존성은 정기적으로 `npm audit`로 확인하고 변경 후 빌드·보안 검사를 실행합니다. 운영 호스팅 대신 Vite 개발 서버를 인터넷에 공개하지 않습니다.
- 유출된 서버 키는 즉시 폐기·교체합니다. AES 키는 기존 데이터 재암호화 없이 교체하면 기존 비밀글을 읽지 못합니다. 로그에 비밀번호·본문·토큰을 기록하지 않습니다.
- 공개 목록 요청, 대규모 분산 공격의 비용까지 이 소스만으로 막지는 못합니다. 사용량·오류·요금 알림을 확인합니다.

참고: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile 서버 검증](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [OWASP 권한 검사](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## 오에카키 통합 경계 (v0.4)

- 원본 도구를 `public/oekaki`의 정적 파일로 포함합니다. 외부 도구 주소를 임베드하지 않습니다.
- 홈페이지의 frame-src에는 self를 허용하고, `/oekaki/*`만 frame-ancestors self / X-Frame-Options SAMEORIGIN으로 설정합니다. 메인 홈페이지는 기존 DENY / frame-ancestors none을 유지합니다.
- 그림방 자체는 신뢰하는 같은 출처의 코드입니다. iframe은 DOM·스타일 분리 용도이며 보안 격리 수단이 아닙니다. 사용자 HTML/JS를 이 경로에서 실행하지 마세요.
- 양방향 메시지는 정확한 origin, source window, 임의 세션을 확인하고, PNG 타입·파일 크기·헤더·픽셀 크기를 검증합니다. 디코딩은 기존 업로드 처리에서 수행합니다.
- DB/Storage 쓰기는 기존 관리자 RLS를 통과해야 합니다. 그림 전송은 게시/로그인 권한을 부여하지 않습니다.
- 브라우저 레이어 임시 저장은 암호화된 비공개 DB 보관이 아닙니다. 공용 PC에서는 중요한 그림을 보관하지 마세요.
- 실제 Cloudflare 배포에서 `/oekaki/index.html`의 중복 CSP가 남지 않고 같은 출처 임베드가 되는지 확인하세요. `_headers`의 헤더 제거 구문은 해당 경로에 한정됩니다.

# 별의 서랍 — 레트로 개인홈 기본 프로젝트

React + TypeScript + Vite / Node.js 개발·빌드 / Supabase Auth·PostgreSQL·Storage.
일기·소설 회차·그림 목록과 상세 보기, 검색·태그, 관리자 글 작성·수정·삭제,
공개·비공개·임시저장, 이미지 웹용 변환, 글 JSON 내보내기를 포함합니다.

## 패치 이력 게시판

메인 하단의 **작은 변화의 기록**에서 공개 패치 이력을 날짜순으로 볼 수 있습니다. 최근 5개를 표시하고, 이전 기록도 같은 화면에서 펼쳐봅니다. 제목을 누르면 본문을 접거나 펼칠 수 있습니다. 최근 게시물 카드와 일기·소설·그림 메뉴에는 섞이지 않으며, 별도 패치 메뉴나 상세 주소는 없습니다.

기존 Supabase 프로젝트에서는 **`supabase/003_patch_history.sql` 전체를 SQL Editor에서 한 번 실행한 뒤** 이 변경을 배포하세요. 이 SQL은 기존 글과 권한을 유지하면서 `posts`에 `update` 분류를 허용합니다. 새 프로젝트는 수정된 `schema.sql`만 실행하면 됩니다. 키나 Edge Function 설정은 추가하지 않습니다.

집주인 로그인 → 관리자 화면 **패치 이력** → **+ 패치 이력 쓰기**에서 제목·본문을 입력하고 공개 상태로 저장합니다. 수정·삭제·임시저장·비공개도 기존 글과 같습니다. 메인에서 로그인한 집주인에게는 관리 버튼이 보입니다. 공개 기록이 없으면 빈 안내가 표시되며, 예시 기록은 DB에 자동 등록하지 않습니다. 전체 JSON 백업의 `posts`에도 패치 이력이 포함됩니다.

## v0.4 오에카키 통합

앞서 만든 작은 그림방 원본의 펜·브러시·지우개·채우기·직선·도형·스포이트·레이어·실행 취소·PNG 저장을 홈페이지 안에 넣었습니다. 폰트는 홈페이지와 같은 Pretendard입니다.

1. 집주인으로 로그인합니다. 샘플 모드에서는 관리자 화면 체험하기를 누릅니다.
2. **그림 메뉴 → 오에카키로 그리기**를 누릅니다. 관리자 책상에서도 열 수 있습니다.
3. 그림방에서 **완성 → 글쓰기**를 누르면 완성 그림이 첨부되고 분류가 그림으로 선택됩니다.
4. 제목·본문·태그를 입력하고 공개·비공개·임시저장 중 선택한 상태로 저장합니다.

새 Supabase SQL이나 서버 함수는 필요하지 않습니다. 기존 artwork 저장소와 posts 권한을 그대로 사용합니다. 오에카키 작업은 브라우저에서 처리하며, 저장 버튼을 누르기 전에는 서버에 업로드하지 않습니다. 오에카키 그림은 선명한 PNG로, 일반 사진 첨부는 WebP로 저장합니다. 집주인만 게시할 수 있습니다.

레이어 임시 저장은 현재 브라우저에만 남습니다. 다른 기기나 외부 작은 그림방 사이트의 임시 그림은 자동으로 옮겨지지 않습니다. 필요하면 기존 사이트에서 PNG를 내려받고 그림방에서 이미지 열기로 가져오세요. 게시된 그림은 레이어가 합쳐진 이미지입니다. JSON 백업에는 그림 경로가 포함되고 그림 파일은 별도로 보관합니다.

보안 헤더에서 로컬 그림방만 같은 출처의 iframe으로 열 수 있게 허용했습니다. `public/_headers`도 함께 배포하세요. 외부 사이트는 홈페이지나 그림방을 프레임에 넣을 수 없으며, 그림 전송은 출처·프레임·세션과 PNG 크기·헤더를 확인합니다.

로컬 검증: `npm run test:oekaki`, `npm run test:security`, `npm run build`. 실제 Supabase 연결·Cloudflare 응답 헤더는 사용자의 프로젝트와 배포 주소에서 확인해야 합니다.

## v0.3 보안 보완

로그인·방명록에 Turnstile 방문자 확인을 추가했습니다. 방명록 서버는 토큰의 성공 여부·용도·hostname을 검증하고 검증 실패나 장애 때 요청을 거절합니다. Supabase Auth에서도 CAPTCHA를 반드시 활성화하세요.
CSP에서 인라인 스타일 허용을 제거하고 HSTS·frame 차단 헤더를 추가했습니다.
검증 범위와 실제 배포 체크는 `SECURITY.md`, 키 설정은 `GUESTBOOK_SETUP.md`를 참고하세요.

## 방명록·이웃 기능

방명록, 작성자 비밀번호로 다시 여는 비밀 방명록, 집주인 답글·삭제, 전체 JSON 백업, 이웃 홈페이지 링크와 배너를 추가했습니다.
설정 방법은 `GUESTBOOK_SETUP.md`를 따릅니다. 기존 DB에는 `002_guestbook_links.sql`을 추가 실행하고 방명록 Edge Function을 배포해야 합니다.
샘플 모드에서는 공개 방명록만 체험할 수 있습니다. 실제 비밀글은 서버 연결 후 사용하세요.

## 1. 먼저 실행

Node.js 22.13 이상을 설치하고 이 폴더에서 실행합니다.

```bash
npm ci
npm run dev
```

터미널에 표시된 localhost 주소를 엽니다. 환경변수가 없으면 샘플 체험 모드입니다.
`집주인 입장 → 관리자 화면 체험하기`에서 편집할 수 있습니다.
샘플 모드 글과 그림은 이 브라우저의 localStorage에만 저장됩니다.
로그인 보안이나 비공개 보호를 제공하는 운영 모드가 아닙니다.
실제 개인 기록은 Supabase 연결 후 사용하세요. 샘플은 DB로 자동 이관되지 않습니다.
같은 Wi-Fi의 휴대폰에서는 dev 터미널에 표시된 Network 주소로 확인할 수 있습니다.

## 2. Supabase 연결

1. https://supabase.com 에서 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/schema.sql` 전체를 한 번 실행합니다. 새 프로젝트 전용입니다.
3. Authentication → Users에서 집주인 이메일·비밀번호로 사용자 하나를 생성하고 확인된 계정으로 설정합니다.
4. 사용자의 UUID를 복사한 뒤 SQL Editor에서 아래를 실행합니다.

```sql
insert into public.home_admins(user_id) values ('복사한 사용자 UUID');
```

5. Auth 설정에서 신규 회원가입과 익명 로그인을 끕니다. Email 로그인은 유지합니다.
6. 프로젝트 Connect 또는 API Keys에서 프로젝트 URL과 `sb_publishable_`로 시작하는 공개용 키를 복사합니다.
7. `.env.example`을 `.env`로 복사하고 두 값을 입력합니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

8. 개발 서버를 재시작합니다. 샘플 모드 표시가 사라지고 DB가 비어 있는 상태로 시작합니다.
9. `GUESTBOOK_SETUP.md`의 Turnstile 설정을 먼저 완료합니다. `VITE_TURNSTILE_SITE_KEY`를 추가하고 Supabase Auth의 CAPTCHA 보호를 활성화합니다.
10. 집주인 입장에서 로그인하고 첫 글을 작성합니다.

브라우저 코드에 `sb_secret_` 또는 `service_role` 키를 넣지 마세요.
VITE_ 변수는 배포된 JavaScript에서 누구나 볼 수 있습니다. 권한은 RLS로 제한합니다.
관리자가 아닌 계정으로 로그인해도 글·파일 변경은 허용되지 않습니다.
비밀번호 분실 시 초기 버전에는 재설정 UI가 없으므로 Supabase 대시보드에서 집주인 계정을 복구하세요.

## 3. 공개 전 권한 검증 — 실제 테넌트에서 수행

현재 프로젝트는 타입 검사·프로덕션 빌드와 샘플 데이터 작성·수정·삭제를 확인했습니다. 모바일·PC 브라우저 시각 검증은 수행하지 못했습니다. 실제 Supabase 연결 및 RLS 검증은 사용자의 프로젝트에서 해야 합니다.

- 로그인해서 공개 글 / 비공개 글 / 임시저장 글을 각각 등록합니다.
- 시크릿 창에서는 공개 글만 목록과 직접 주소로 조회되는지 확인합니다.
- 공개 글 첨부 이미지는 보이고 비공개·임시저장 이미지는 비로그인 요청으로 새 signed URL을 발급받지 못하는지 확인합니다.
- 집주인 권한이 없는 테스트 계정에서는 REST API로 직접 insert/update/delete를 시도해도 거절되는지 확인합니다.
- 관리자 화면에서 파일 업로드·글 수정·삭제가 되는지 확인합니다.

이미지 저장소 `artwork`는 private입니다. 공개 게시물에 연결된 파일만 방문자가 서명 URL을 발급받아 볼 수 있습니다.
서명 URL은 10분 동안 유효하므로 공개→비공개 전환 직후 기존 URL은 만료까지 접근 가능할 수 있습니다.
그림 업로드가 글 저장보다 먼저 이루어지므로 취소한 첨부, 교체된 파일, 삭제한 게시물의 그림은 저장소에 남습니다.
초기 버전은 자동 파일 삭제를 하지 않습니다. Storage 대시보드에서 미사용 파일을 주기적으로 정리하세요.

## 4. Cloudflare Pages 배포

1. GitHub에 저장소를 만들고 프로젝트 소스를 push합니다. `.env`와 node_modules는 올리지 않습니다.
2. Cloudflare → Workers & Pages → Pages에서 GitHub 저장소를 연결합니다.
3. 프레임워크 React / Vite, 빌드 명령 `npm run build`, 출력 폴더 `dist`로 설정합니다.
4. Node.js 버전은 22.13 이상으로 지정합니다.
5. 빌드 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_PUBLIC_SITE_URL`을 추가합니다. 값 변경 후에는 재배포해야 합니다. 서버 Secrets는 여기에 넣지 않습니다.
6. 배포 후 `프로젝트명.pages.dev`로 접속하고 Supabase Auth의 Site URL에도 배포 주소를 등록합니다.
7. 실제 폰에서 메뉴·글 작성·그림 업로드·새로고침을 확인합니다.

주소는 `/#diary`, `/#post/UUID` 같은 해시 라우팅입니다. 별도 SPA rewrite 설정 없이 새로고침할 수 있습니다.
해시 라우팅과 클라이언트 렌더링을 사용한 기본 프로젝트라 게시물별 검색엔진 색인과 SNS 미리보기는 아직 구현하지 않았습니다.
필요해지면 공개 글 페이지를 정적 생성하거나 SSR로 확장하세요.
본문·제목·입력 요소는 Pretendard Variable v1.3.9 웹폰트를 사용합니다. jsDelivr CDN의 가변 다이나믹 서브셋으로 필요한 글자를 선택적으로 로드합니다. CDN이 차단되면 시스템 글꼴로 표시됩니다. 레트로 장식용 작은 영문 라벨은 기존 monospace 스타일을 유지합니다.
Pretendard는 SIL Open Font License 1.1로 배포되며 개인·상업 웹사이트에서 무료로 사용할 수 있습니다.
라이선스와 공식 안내: https://github.com/orioncactus/pretendard

## 5. 내 취향으로 바꾸기

- 홈 이름·닉네임·소개: `src/config.ts`
- 색감·레이아웃·모바일 스타일: `src/style.css`
- 메뉴·홈·상세·관리자 화면: `src/App.tsx`
- 로그인·글·파일 저장 어댑터: `src/data.ts`
- 샘플 그림: `public/art/window.svg` — 이 프로젝트에서 만든 벡터 샘플
- DB·권한: `supabase/schema.sql`

Node.js는 이 버전에서 개발 서버와 빌드를 담당합니다. 별도 Express 서버는 없습니다.
로그인·DB·파일 API는 Supabase를 사용합니다. 향후 Node API 서버가 필요하면
`data.ts`의 호출을 해당 API로 바꾸는 방식으로 확장할 수 있습니다.
컴포넌트 구조는 시작용이며 기능이 늘면 페이지와 Editor·Picture를 별도 파일로 분리하세요. 방명록·이웃 UI는 `src/Community.tsx`, API 호출은 `src/community-data.ts`로 분리했습니다.

## 6. 백업·이전

관리자 JSON 내보내기는 로그인 계정이 조회할 수 있는 글 전체를 저장합니다.
실제 Supabase 모드에서는 그림 경로만 저장되며, 그림 파일은 Storage에서 따로 백업해야 합니다.
DB 스키마와 RLS 정책은 이 저장소의 SQL을 함께 보관하세요.
AWS로 이전 시 글 DB는 PostgreSQL로, 그림은 S3 등으로 이전하고 `data.ts`를 교체합니다.
Supabase 인증·RLS·서명 URL은 새 서버의 인증·권한 검사로 대체해야 합니다.
JSON 내보내기 파일에는 비공개 글도 포함되므로 공개 저장소에 올리지 마세요.

## 확인한 내용

이 묶음은 기본 프로젝트입니다. Supabase 계정 생성, 실제 서비스 연결, 공개 배포는 수행하지 않았습니다.
실행·수정·배포에 필요한 소스와 설정 SQL을 제공합니다.

참고 문서:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/getting-started/api-keys
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/

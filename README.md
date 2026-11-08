# English Word Quiz

개인별 단어장과 퀴즈, 오답 복습, 발표 대본 훈련을 제공하는 공개 회원용 영어 학습 서비스입니다.

## 기술 구성

- Next.js / React / TypeScript
- PostgreSQL + Drizzle ORM (단어 학습 데이터)
- Better Auth + PostgreSQL (회원, 로그인, 세션)
- Gemini API (이미지 단어 추출 및 AI 퀴즈)
- Azure Speech (TTS 및 발음 평가)

## 환경변수

Vercel 프로젝트의 **Settings → Environment Variables**에 등록합니다.

- `DATABASE_URL`: 이 서비스 전용 PostgreSQL 연결 문자열. 기존 `word-test` 가족용 DB와 절대 공유하지 않습니다.
- `BETTER_AUTH_SECRET`: 32바이트 이상의 무작위 비밀키 (`openssl rand -base64 32`로 생성)
- `BETTER_AUTH_URL`: 배포된 서비스의 기본 URL
- `GEMINI_API_KEY`: Gemini API 키
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: Azure Speech 설정

`.env.example`을 참고하세요. 실제 비밀값은 Git에 커밋하지 않습니다.

## 새 PostgreSQL 데이터베이스 초기화

새 DB를 만든 뒤 로컬 환경변수에 새 DB의 `DATABASE_URL`을 설정합니다.

1. `pnpm install`
2. `pnpm auth:migrate` — Better Auth 회원/세션 테이블 생성
3. `pnpm db:generate` — 단어장 테이블 마이그레이션 생성
4. `pnpm db:migrate` — 단어장 테이블 적용

Vercel 배포 환경에서도 동일한 새 DB 연결 문자열과 인증 환경변수를 등록해야 합니다. DB 마이그레이션은 새 DB에만 실행합니다.

## 데이터 격리 원칙

- 기존 `jinho1120-tech/word-test` 저장소와 가족용 데이터베이스는 수정하지 않습니다.
- 가족용 데이터는 이 서비스로 복사하거나 가져오지 않습니다.
- 모든 단어 조회/추가/수정/삭제 및 AI 기능은 로그인 세션을 확인합니다.
- 단어 레코드는 인증된 사용자 ID로 범위를 제한합니다.

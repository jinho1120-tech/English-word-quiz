# English Word Quiz

개인별 단어장과 퀴즈, 오답 복습, 발표 대본 훈련을 제공하는 공개 회원용 영어 학습 서비스입니다.

## 기술 구성

- Next.js / React / TypeScript
- PostgreSQL + Drizzle ORM (가족·자녀·단어·보상 데이터)
- Better Auth + PostgreSQL (부모 회원, 로그인, 세션)
- Gemini API (이미지 단어 추출 및 AI 퀴즈)
- Azure Speech (TTS 및 발음 평가)

## 계정 구조

- 부모는 이메일과 비밀번호로 가입하고 로그인합니다.
- 부모 계정 아래에 여러 자녀 프로필을 만들 수 있습니다.
- 자녀는 별도 이메일 계정 없이 접속 코드 + PIN 또는 QR 코드로 자기 기기를 최초 등록합니다.
- 등록된 자녀 기기는 자녀 전용 보안 세션으로 자동 로그인되며, 부모가 원격으로 접속을 해제할 수 있도록 설계합니다.
- 부모와 해당 자녀는 같은 자녀 단어장을 관리할 수 있지만, 다른 자녀의 데이터에는 접근할 수 없습니다.
- 쿠폰 발행 여부, 쿠폰 종류, 보상 조건, 부모 전화번호는 부모가 설정합니다.

세부 보안·인증·데이터 설계는 [가족 계정 설계 문서](docs/family-accounts.md)를 참고하세요.

## 환경변수

Vercel 프로젝트의 **Settings → Environment Variables**에 등록합니다.

- `DATABASE_URL`: 이 서비스 전용 PostgreSQL 연결 문자열. 기존 `word-test` 가족용 DB와 절대 공유하지 않습니다.
- `BETTER_AUTH_SECRET`: 32바이트 이상의 무작위 비밀키
- `BETTER_AUTH_URL`: 배포된 서비스의 기본 URL
- `GEMINI_API_KEY`: Gemini API 키
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: Azure Speech 설정

실제 비밀값은 Git에 커밋하지 않습니다.

## 데이터베이스 초기화

가족 계정, 자녀별 과목 및 자녀 기기 인증 구조를 코드에 반영하고 검증한 뒤 최종 마이그레이션을 생성하고 적용합니다. 현재 단계에서는 Neon 데이터베이스에 테이블을 만들거나 마이그레이션을 실행하지 않습니다.

## 데이터 격리 원칙

- 기존 `jinho1120-tech/word-test` 저장소와 가족용 데이터베이스는 수정하지 않습니다.
- 가족용 데이터는 이 서비스로 복사하거나 가져오지 않습니다.
- 부모 작업은 Better Auth 세션에서 확인한 소유자 ID로 범위를 제한합니다.
- 자녀 작업은 서버가 검증한 자녀 기기 세션으로 범위를 제한합니다.
- 브라우저가 전달한 부모 ID, 자녀 ID, 프로필 이름은 인증 증거로 신뢰하지 않습니다.

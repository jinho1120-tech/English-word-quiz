# Vercel 배포 운영 정책

이 문서는 `English-word-quiz` 프로젝트의 배포 횟수와 Production 환경을 보호하기 위한 필수 운영 규칙이다.

## 1. 기본 원칙

**GitHub 코드 변경과 Vercel 실제 배포를 분리한다.** 커밋, 푸시, 브랜치 생성, PR 생성 및 코드 검증은 실제 배포 승인으로 간주하지 않는다.

## 2. Vercel 자동 배포 설정

- Vercel Project의 **Ignored Build Step > Behavior**는 `Only build production`으로 유지한다.
- 사용자의 명시적 요청과 사전 승인 없이 `Automatic`으로 변경하지 않는다.
- 자동 배포 설정을 임의로 바꾸어 Preview 배포를 유발하지 않는다.

## 3. Preview 배포 절차

Preview 배포는 다음 절차를 모두 거친 경우에만 실행한다.

1. 사용자가 Preview 배포를 명시적으로 요청한다.
2. 배포할 저장소, 브랜치, 커밋 SHA, Preview 환경변수 및 연결 DB가 무엇인지 확인한다.
3. 예상되는 배포 횟수와 무료 할당량 영향을 사용자에게 설명한다.
4. 사용자의 별도 승인을 받는다.
5. 승인된 대상에 한해 Vercel CLI 등으로 수동 Preview 배포를 실행한다. Production 배포 옵션(`--prod`)은 사용하지 않는다.
6. 검증이 끝나면 Preview URL과 결과를 보고하고, 필요하면 사용자의 지시에 따라 정리한다.

사용자가 단순히 코드 수정, 푸시, 테스트 또는 PR 작업을 요청한 것은 Preview 배포 승인으로 간주하지 않는다.

## 4. Production 배포 절차

- Production 배포는 Preview 배포와 별개의 작업이다.
- 사용자가 Production 배포를 명시적으로 요청하고, 대상 커밋과 운영 영향에 대해 설명을 들은 뒤 별도로 승인한 경우에만 실행한다.
- Preview 승인이나 PR 병합 승인을 Production 배포 승인으로 간주하지 않는다.
- 운영 DB 변경 및 운영 환경변수 변경도 각각 별도 승인 대상이다.

## 5. Ignored Build Step과 할당량

- Ignored Build Step으로 빌드를 건너뛰거나 취소해도 배포 할당량에 포함될 수 있다.
- 따라서 Ignored Build Step은 배포 횟수를 절약하는 확실한 방법으로 간주하지 않는다.
- 불필요한 배포 시도를 만들지 않는다. Preview가 필요할 때만 승인 후 수동 배포한다.

## 6. 승인 원칙

**사용자의 명시적 사전 승인 없이는 Preview 또는 Production 배포 명령을 실행하지 않는다.**

승인 범위는 사용자가 승인한 대상과 환경에만 한정한다. 다른 브랜치, 커밋, 환경 또는 재배포는 새 승인을 받아야 한다.

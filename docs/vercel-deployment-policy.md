# Vercel 배포 정책 — English-word-quiz

- 마지막 확인: 2026-11-17
- 적용 대상: `jinho1120-tech/English-word-quiz` 저장소와 연결된 Vercel 프로젝트
- Vercel 팀: `jinho1120-6268` (Hobby)
- Vercel 프로젝트: `english_word_quiz`
- 프로젝트 ID: `prj_ym5gIbTS7rE3KFC3K0TvW5WZ5xNF`
- 운영 주소: https://englishwordquiz.vercel.app

이 문서는 이 저장소를 수정하는 AI 코딩 도구와 사람 개발자가 반드시 따라야 하는 운영 규칙이다. 배포 관련 코드를 수정하기 전뿐 아니라 **모든 코드·설정·워크플로 변경을 시작하기 전에** 이 문서와 루트 `AGENTS.md`를 읽는다.

## 1. 가장 중요한 원칙

1. **코드 변경, PR 생성, PR 병합, Preview 배포, Production 배포는 서로 다른 작업이다.** 한 작업에 대한 승인은 나머지 작업까지 자동으로 허가하지 않는다.
2. 사용자가 해당 작업을 명시적으로 요청하지 않았다면 PR을 병합하거나 Vercel 배포를 생성·재배포·승격하지 않는다.
3. `main`에 커밋을 직접 push하거나 PR을 `main`에 병합하면 Vercel Production 배포가 자동으로 시작될 수 있다. 따라서 `main`을 변경하기 전에는 운영 배포가 발생한다는 사실을 사용자에게 분명히 알리고 명시적 승인을 받는다.
4. Vercel의 Hobby 할당량을 보호하는 것이 우선이다. 테스트를 위해 임의 배포를 시도하거나 실패 후 자동 재시도하지 않는다.
5. 배포가 실패하거나 rate limit 오류가 발생하면 즉시 중단한다. 설정을 안전한 상태로 복구하고, 새 승인이 없는 한 재시도하지 않는다.

## 2. 현재 Vercel 프로젝트 설정 (2026-11-17 기준)

### Preview

- Vercel 프로젝트의 Preview 배포 기능을 **비활성화한 상태**로 설정했다.
- 2026-11-17 Vercel 프로젝트 변경 이벤트에서 `previewDeploymentsEnabled: false`를 확인했다.
- Vercel 프로젝트 조회 응답에는 이 필드가 표시되지 않을 수 있다. 따라서 단순히 `get_project` 응답에 필드가 없다는 이유로 활성화 상태라고 추측하지 않는다. Vercel Project Settings 또는 프로젝트 변경 이벤트/audit 기록으로 확인한다.
- 이 설정은 Git 작업 브랜치가 자동 Preview를 만드는 것을 막기 위한 기본 잠금이다. 사용자 요청 없이 다시 활성화하지 않는다.
- Preview 잠금 상태에서 수동 API Preview 생성이 허용되는지는 아직 별도 성공 배포로 검증하지 않았다. 성공이 확인되기 전에는 API가 잠금을 우회한다고 가정하지 않는다.

### Ignored Build Step

현재 설정은 다음 명령이며 임의로 바꾸지 않는다.

```sh
if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
```

Vercel Ignored Build Step의 종료 코드 의미:
- `exit 1`: 빌드를 계속한다.
- `exit 0`: 빌드를 무시하고 취소한다.

그러므로 위 명령은 Production 빌드는 계속하고 Preview 빌드는 빌드 단계에서 취소한다. 그러나 이것은 **배포 생성 자체를 차단하는 설정이 아니다.** Git push 후 배포 객체가 생성되고 저장소 복제·캐시 복원까지 진행된 다음 취소될 수 있다. 취소된 배포도 할당량을 소모할 수 있다고 간주하고, 이 명령을 배포 횟수 보호 장치로 취급하지 않는다.

- 이 설정을 `Automatic`으로 바꾸지 않는다.
- 현재 명령을 바꿀 필요가 생기면 변경 전후 동작과 배포 영향 및 되돌리기 방법을 먼저 설명하고 별도 승인을 받는다.

### Deployment Policy 기능

- Vercel API에서 `deploymentPolicy` 설정을 시도했으나 Hobby 요금제에서 `403 pro_plan_required`로 거부됐다.
- Pro 업그레이드 승인 없이 Deployment Policy를 사용하려 시도하거나 요금제를 변경하지 않는다.

## 3. 배포 할당량과 rate limit 운영 규칙

- Hobby 배포 제한은 팀 단위 사용량과 시간 구간별 제한의 영향을 받을 수 있다. 2026-11-17 당시 확인한 Hobby 기준은 24시간 배포 100회이며, 세부 제한은 바뀔 수 있으므로 작업 시점의 공식 문서를 다시 확인한다.
- 참고: https://vercel.com/docs/limits/overview
- `Deployment rate limited — retry in 24 hours` 메시지만으로 정확한 재시도 가능 시각을 계산하지 않는다. 마지막 배포 한 건부터 24시간을 세는 단순 타이머로 해석하지 않는다.
- 취소(`CANCELED`), 오류(`ERROR`), Ignored Build Step에 의해 종료된 배포도 quota를 소모하지 않는다고 가정하지 않는다. **Vercel에 배포 객체가 생성된 모든 시도는 할당량 위험으로 계산**한다.
- Rate limit 확인 시 프로젝트 하나만 보지 말고 Hobby 팀 전체의 최근 배포 이력을 확인한다. 필요하면 페이지네이션 또는 시간 구간별 조회로 전체 기간을 확인한다.
- 배포 이력과 이벤트 로그를 함께 확인한다. 현재 연결된 도구에서 실시간 rate-limit 카운터를 직접 읽을 수 없으면, 실제 사용량을 확인했다고 주장하지 않는다.
- 제한 해제 시각은 실제 Vercel 상태/오류 메시지를 다시 확인해 판단한다. 근거가 불충분하면 배포 요청을 보내지 않는다.
- Preview 확인을 위해 여러 커밋을 연속 push하지 않는다. 먼저 GitHub CI에서 특정 commit SHA를 검증하고 그 SHA 하나만 대상으로 배포한다.

## 4. Preview 배포 절차 — 사용자 승인 필수

Preview는 기본적으로 비활성화한다. 사용자가 **특정 작업의 Preview 배포를 명시적으로 승인한 경우에만** 아래 절차를 따른다.

1. 승인 범위를 확인한다. 대상 브랜치와 commit SHA가 명확해야 한다. 일반적인 개발 승인이나 PR 생성 승인은 Preview 배포 승인이 아니다.
2. 해당 SHA의 GitHub Actions 필수 검사가 성공했는지 확인한다.
3. Vercel Hobby 팀 전체 배포 이력과 최근 rate limit 상태를 확인한다. 한도나 제한 해제 여부가 불확실하면 여기서 중단한다.
4. Vercel 프로젝트의 Preview 비활성화 상태와 Ignored Build Step이 안전한 상태인지 확인한다. 설정을 읽거나 확인할 방법이 없다면 추측해서 진행하지 않는다.
5. 현재 Preview 잠금이 수동 API 배포까지 막는 것으로 확인되면, 승인된 단 한 번의 Preview 작업에 필요한 경우에만 Preview를 임시 활성화한다. 이 짧은 시간 동안 다른 브랜치 push/PR 갱신이 자동 Preview를 만들 수 있으므로 병행 Git 변경을 하지 않는다.
6. 승인된 브랜치와 SHA로 Preview 배포를 **한 번만** 요청한다. Preview API 요청에서 Production 대상을 지정하지 않는다. 중복 방지를 우회하는 강제 새 배포 옵션을 사용하지 않는다.
7. 배포 요청 직후 Preview 비활성화를 다시 적용하고, 변경 이벤트 또는 Vercel 설정 화면에서 복구를 확인한다.
8. 배포 상태가 `READY`인지 확인한 뒤에만 테스트 URL을 전달한다. 안정 별칭이 필요하면 READY 확인 뒤에만 할당하고 확인한다.
9. 생성 요청이 rate limit 또는 다른 오류로 실패하면 즉시 Preview 잠금을 복구하고 종료한다. 새로운 명시적 승인 없이는 재시도하지 않는다.

Preview 잠금 설정을 임시로 해제하는 것만으로 자동 배포가 안전하게 차단된다고 가정하지 않는다. Git 변경이 동시에 발생하지 않게 통제할 수 없거나 설정 상태를 확인할 수 없으면 Preview 배포를 진행하지 않는다.

## 5. Production 배포 절차 — 사용자 승인 필수

- Production의 기준 브랜치는 `main`이다.
- `main`에 push/병합하면 연결된 Vercel Production 배포가 자동으로 시작될 수 있다. 따라서 `main` 변경을 단순한 Git 정리나 문서 작업으로 취급하지 않는다.
- `main`에 병합하기 전에 사용자에게 Production 배포가 시작될 수 있음을 알리고 명시적 승인을 받는다.
- 승인 후에도 병합 직전 최신 커밋과 GitHub CI를 다시 확인한다.
- Production 배포가 시작되면 Vercel에서 `READY`인지 확인한다. 요청만 성공한 상태를 배포 성공이라고 말하지 않는다.
- Production 변경, 재배포, promote, rollback, 도메인 alias 변경은 별도 사용자 승인 없이는 실행하지 않는다.

## 6. 절대 재사용하지 말아야 할 위험한 설정과 기존 PR

### `git.deploymentEnabled: false` 전체 차단

Vercel 공식 문서에서 다음 설정은 **모든 브랜치의 Git 자동 배포를 끄는 설정**이다.

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

이는 작업 브랜치뿐 아니라 `main`의 자동 Production 배포도 끌 수 있다. 사용자가 Production 배포 방식 전체를 수동으로 바꾸겠다고 별도 승인하지 않은 한 이 값을 추가하거나 병합하지 않는다.

참고: https://vercel.com/docs/project-configuration/git-configuration

### 기존 PR #49

- PR #49: https://github.com/jinho1120-tech/English-word-quiz/pull/49
- 제목: Disable automatic Vercel Git deployments
- 이 PR의 `vercel.json`은 모든 브랜치 Git 배포를 끄는 `git.deploymentEnabled: false`를 사용한다.
- 조회 당시 PR 전체 변경에는 Vercel 설정 외 다수의 기존 변경(21개 파일, 2,288줄 삭제 포함)이 들어 있었다.
- 따라서 **PR #49를 그대로 병합하거나 그 브랜치를 새 변경의 기반으로 사용하지 않는다.** 이 PR은 현재 운영 정책을 대체하지 않는다.

### 기존 AI 기능 브랜치의 `vercel.json`

2026-11-17 기준 `feature/ai-vocabulary-learning`에는 다음 기능 설정이 존재한다.
- 서울 시간대 매일 08:00 실행하는 `daily-ai-vocabulary` 스케줄
- `app/api/cron/ai-vocabulary/route.ts`의 `schedule/v1beta` 트리거 설정
- `feature/vocabulary-candidate-bulk-ingestion` 브랜치 배포 제어

향후 이 파일을 수정하거나 다른 브랜치의 파일과 병합할 때 기존 스케줄·함수 트리거를 통째로 덮어쓰거나 삭제하지 않는다. 먼저 대상 브랜치의 현재 파일을 읽고 JSON 설정을 병합한다. 특정 브랜치 설정이 다른 브랜치나 `main`에도 이미 적용됐다고 가정하지 않는다.

## 7. 매 작업 시작 전/배포 직전 체크리스트

### 모든 코드·설정 변경 전
- [ ] 루트 `AGENTS.md`를 읽었다.
- [ ] 이 문서 `docs/vercel-deployment-policy.md`를 읽었다.
- [ ] 현재 작업 브랜치와 대상 브랜치를 확인했다.
- [ ] 변경이 `main`, `vercel.json`, GitHub Actions, Vercel 환경변수/프로젝트 설정에 미칠 영향을 확인했다.
- [ ] 앱 코드 변경, PR, 병합, 배포를 각각 분리해서 사용자 승인 범위를 확인했다.

### Preview/Production 배포 직전
- [ ] 해당 배포에 대한 사용자의 명시적 승인이 있다.
- [ ] 정확한 commit SHA와 GitHub CI 결과를 확인했다.
- [ ] Hobby 팀의 최근 배포 기록과 rate limit 상태를 확인했다.
- [ ] Preview 잠금 및 Ignored Build Step 상태를 확인했다.
- [ ] 배포 요청 횟수를 한 번으로 제한했다.
- [ ] Preview 배포 후 Preview 잠금을 복구했다.
- [ ] READY 상태를 직접 확인했다.

## 8. 공식 참고 문서

- Vercel Limits: https://vercel.com/docs/limits/overview
- Vercel Git 설정: https://vercel.com/docs/project-configuration/git-configuration
- Vercel `vercel.json` 및 Ignored Build Step: https://vercel.com/docs/project-configuration/vercel-json
- Vercel 프로젝트 API: https://vercel.com/docs/rest-api/projects/update-a-project

요금제 한도와 Vercel 설정 이름·동작은 변경될 수 있다. 이 문서의 날짜가 오래됐거나 실제 Vercel 이벤트/설정과 다르면 최신 Vercel 화면 및 공식 문서를 확인해 사용자와 합의한 뒤 문서를 갱신한다.

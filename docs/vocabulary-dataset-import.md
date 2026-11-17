# 공개 어휘 데이터셋 가져오기

## WortUniversum 가져오기

슈퍼 관리자 어휘 가져오기는 UTF-8 CSV/JSON/JSONL 파일을 받습니다. WortUniversum 원본은 SQLite 파일이므로 제공된 변환 스크립트로 CSV 조각을 만든 뒤 업로드합니다.

1. [WortUniversum 데이터셋](https://huggingface.co/datasets/cstr/grundwortschatz-voc-en)에서 `grundwortschatz_en.db.gz` 파일을 내려받습니다.
2. Windows PowerShell에서 저장소 루트로 이동한 뒤, 먼저 300개 표제어를 시험용으로 추출합니다.

   ```powershell
   py -3 scripts\export_worduniversum_sqlite.py "$env:USERPROFILE\Downloads\grundwortschatz_en.db.gz" --limit-per-table 300 --output-dir "$env:USERPROFILE\Downloads\worduniversum-sample"
   ```

3. 시험용 데이터가 정상적으로 가져와지는 것을 확인한 뒤 전체 자료를 추출합니다.

   ```powershell
   py -3 scripts\export_worduniversum_sqlite.py "$env:USERPROFILE\Downloads\grundwortschatz_en.db.gz" --output-dir "$env:USERPROFILE\Downloads\worduniversum-import"
   ```

4. 생성된 CSV를 한 파일씩 슈퍼 관리자 어휘 가져오기 화면에 올립니다. 기본 파일당 500행이며 원본 학년·CEFR·YLE·빈도 신호는 보존됩니다.
5. 중복 미리보기를 확인하고 신규 후보를 가져옵니다. 후보는 사전 검증 대기 상태로 저장됩니다.
6. 후보 검토 화면에서 **다음 5개 사전 검증 및 뜻 제안**을 반복 실행합니다. FreeDictionaryAPI가 영어 표현의 품사와 정의를 대조하고, 같은 의미를 확인한 후보만 검증 통과 상태가 됩니다.
7. API에 한국어 번역이 있으면 그 번역을 사용합니다. 없으면 FreeDictionaryAPI에서 검증된 영어 정의만을 바탕으로 Gemini가 한국어 뜻 초안을 만들며, 화면에 AI 생성 표시를 붙입니다. 관리자는 제안을 확인한 뒤 승인하거나 제외합니다.
8. 난이도는 AI가 정하지 않습니다. 원본 `grade_level` 또는 `gradeLevelEstimate`를 우선 사용하고, 없으면 `grade_band`, YLE, CEFR, frequency band 순서의 고정 규칙으로 서비스 L1~L6에 대응합니다. 원본 신호와 적용 규칙을 후보 카드에서 확인할 수 있습니다. 원본 레벨 근거가 없는 항목은 외부 데이터로 승인할 수 없습니다.

## 검증 및 처리량

- 파일 가져오기와 사전 검증은 별도 단계입니다. 대형 데이터셋을 한 번에 수천 건 외부 API로 호출하지 않습니다.
- 관리자 실행 한 번은 서로 다른 영어 표현 최대 5개를 검증합니다. 반복 실행할 수 있고, 일시 실패는 재시도 상태로 남습니다.
- FreeDictionaryAPI 결과는 캐시합니다. 대량 검증용 캐시 미스 요청은 전역 시간당 800회로 제한하여 제공자 한도보다 낮게 유지합니다.
- 영어 뜻 또는 품사가 일치하지 않으면 불일치 상태로 남고 자동 승인되지 않습니다.
- Gemini가 뜻 초안을 만들지 못하면 사전 검증은 보존하고 한국어 뜻만 다시 생성할 수 있습니다.
- 원본 데이터셋의 출처·라이선스와 FreeDictionaryAPI/Wiktionary 검증 출처는 별도로 기록합니다.

## Open English WordNet

Open English WordNet은 동의어 집합과 의미 관계를 제공하는 어휘망입니다. 공식 다운로드 ZIP은 먼저 압축을 풀고, 각 레코드를 표제어·품사·영어 정의 형태의 평탄한 CSV/JSON/JSONL로 변환해야 합니다. 원본 계층형 JSON/ZIP을 그대로 업로드하는 기능은 아직 없습니다.

## 라이선스 및 승인

- WortUniversum은 CC BY-SA 4.0, Open English WordNet은 CC BY 4.0 조건을 확인합니다.
- FreeDictionaryAPI/Wiktionary는 사전 의미·품사 대조와 API가 명시한 한국어 번역의 별도 출처로 표시합니다.
- 데이터셋 원문이나 AI 초안은 자동 승인되지 않습니다. 관리자가 뜻과 난이도 제안을 확인하고 승인한 후보만 레벨 테스트에 사용됩니다.

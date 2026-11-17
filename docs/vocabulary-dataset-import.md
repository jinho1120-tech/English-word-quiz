# 공개 어휘 데이터셋 가져오기

## WortUniversum 가져오기

슈퍼 관리자 어휘 가져오기는 UTF-8 CSV/JSON/JSONL 파일을 받습니다. WortUniversum 원본은 SQLite 파일이므로 제공된 변환 스크립트로 CSV 조각을 만든 뒤 업로드합니다.

1. [WortUniversum 데이터셋](https://huggingface.co/datasets/cstr/grundwortschatz-voc-en)에서 `grundwortschatz_en.db.gz` 파일을 내려받습니다.
2. 저장소를 Windows PowerShell로 열고 저장소 루트에서 먼저 300개 표제어만 시험용으로 추출합니다. 다운로드 경로가 다르면 파일 경로만 바꾸면 됩니다.

   ```powershell
   py -3 scripts\export_worduniversum_sqlite.py "$env:USERPROFILE\Downloads\grundwortschatz_en.db.gz" --limit-per-table 300 --output-dir "$env:USERPROFILE\Downloads\worduniversum-sample"
   ```

3. 시험용 데이터가 정상적으로 검토·가져오기 되는 것을 확인한 뒤 전체 자료를 추출합니다. 전체 추출은 별도 폴더를 사용합니다.

   ```powershell
   py -3 scripts\export_worduniversum_sqlite.py "$env:USERPROFILE\Downloads\grundwortschatz_en.db.gz" --output-dir "$env:USERPROFILE\Downloads\worduniversum-import"
   ```

4. 스크립트가 `words_001.csv`, `words_002.csv`처럼 크기와 행 수 제한에 맞춰 CSV를 나눕니다. 기본은 파일당 500행이며, `--max-rows`로 최대 5,000행까지 조정할 수 있습니다. `phrasal_verbs_001.csv`도 별도로 생성합니다.
5. Preview가 승인되어 배포된 뒤 슈퍼 관리자 계정으로 `/super-admin/vocabulary`에 접속합니다.
6. 출처에서 **WortUniversum**을 선택하고 CSV를 한 파일씩 올립니다. 자동 연결된 `lemma`, `word_type`, `enrichment_json`, `metadata_json` 열을 확인한 다음 중복 미리보기를 실행하고 가져오기를 확정합니다.
7. 모든 신규 항목은 검토 대기 상태로 들어갑니다. 한국어 뜻, 자녀 레벨 L1~L6 및 난이도를 직접 검토한 항목만 승인합니다.

변환 스크립트는 Python 표준 라이브러리만 사용하며 원본 SQLite DB를 읽기 전용으로 엽니다. 데이터베이스 파일을 수정하지 않습니다. CSV 조각은 파일당 기본 500행 이하, 최대 5,000행 및 7MiB 이하로 저장해 여러 뜻이 후보로 확장되는 경우에도 파일별 처리량을 낮추고 앱의 8MiB 업로드 제한에 여유를 둡니다. `--limit-per-table 300`은 각 테이블의 첫 300행만 추출하는 초기 시험용 옵션입니다.

## Open English WordNet

Open English WordNet은 동의어 집합과 의미 관계를 제공하는 어휘망입니다. 공식 다운로드 ZIP은 먼저 압축을 풀고, 각 레코드를 표제어·품사·영어 정의 형태의 평탄한 CSV/JSON/JSONL로 변환해야 합니다. 원본 계층형 JSON/ZIP을 그대로 업로드하는 기능은 아직 없습니다. 이 자료는 아동 난이도나 한국어 뜻을 검증한 학습 단어 목록으로 취급하지 않습니다.

## 검토 및 라이선스

- 출처별 라이선스와 원문 링크를 확인하고 정확히 기록합니다.
- WortUniversum 데이터는 CC BY-SA 4.0, Open English WordNet 데이터는 CC BY 4.0 조건을 확인합니다.
- 원본 CEFR과 학년 추정치는 참고정보일 뿐 서비스의 L1~L6으로 자동 변환되지 않습니다.
- 외부 데이터가 들어왔다는 이유만으로 자동 승인하지 않습니다. 한국어 의미와 난이도 검토를 마쳐야 자녀의 통합 레벨 테스트에 사용됩니다.

# Course Clip Script Runner

클립 월별 수강 시간 집계를 위한 React 웹 애플리케이션입니다.

## 기능

- CSV 파일 업로드 및 파싱
- 월별 수강 데이터 집계
- Skillflo API를 통한 메타데이터 조회
- 결과 CSV 파일 다운로드
- 실시간 진행 상황 표시

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

### 3. 프로덕션 빌드

```bash
npm run build
```

## 사용 방법

1. **CSV 파일 업로드**: `summary_progress_product_course_contents.csv` 파일을 업로드합니다
2. **환경 선택**: Development, QA, Staging, Production, Local 중 선택합니다
3. **인증 정보 입력**: Skillflo 계정의 이메일과 비밀번호를 입력합니다
4. **스크립트 실행**: "스크립트 실행" 버튼을 클릭하여 집계를 시작합니다
5. **결과 다운로드**: 완료 후 결과 CSV 파일을 다운로드합니다

## 프로젝트 구조

```
data-export/
├── src/
│   ├── components/
│   │   └── CourseClipScriptRunner.jsx  # 메인 컴포넌트
│   ├── App.jsx                          # 앱 진입점
│   └── main.jsx                         # React DOM 렌더링
├── index.html                           # HTML 템플릿
├── package.json                        # 프로젝트 설정
├── vite.config.js                      # Vite 설정
├── tailwind.config.js                  # Tailwind CSS 설정
└── README.md                           # 프로젝트 문서
```

## 주요 클래스

### TokenAuthenticator
- Skillflo API 인증 처리
- Access Token 및 Member Token 관리

### MetaFetcher
- 메타데이터 조회 (멤버, 상품, 코스, 콘텐츠)
- 배치 처리로 효율적인 API 호출

## 유틸리티 함수

- `parseCSV`: CSV 파일 파싱
- `aggregateMonthly`: 월별 데이터 집계
- `extractRequiredIds`: 필요한 ID 추출
- `generateOutputCSV`: 결과 CSV 생성

## 환경 설정

### API 엔드포인트
- **Development**: `https://api.dev.skillflo.io/api/backoffice`
- **QA**: `https://api.qa.skillflo.io/api/backoffice`
- **Staging**: `https://api.staging.skillflo.io/api/backoffice`
- **Production**: `https://api.skillflo.io/api/backoffice`
- **Local**: `http://localhost:3000/api/backoffice`

## 주의사항

- 실제 API 호출이 이루어지므로 네트워크 연결이 필요합니다
- 유효한 Skillflo 인증 정보가 필요합니다
- 대용량 데이터 처리 시 시간이 오래 걸릴 수 있습니다

## 기술 스택

- **React 18**: UI 프레임워크
- **Vite**: 빌드 도구
- **Tailwind CSS**: 스타일링
- **Lucide React**: 아이콘
- **ESLint**: 코드 품질 관리

## 라이선스

MIT

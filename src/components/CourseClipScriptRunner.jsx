import React, { useState } from 'react';
import { Upload, Play, Download, AlertCircle, CheckCircle, Loader2, Database } from 'lucide-react';

// API 인증 클래스
class TokenAuthenticator {
  constructor(environment) {
    this.environment = environment;
    this.apiBaseUrl = this.getApiBaseUrl(environment);
    this.accessToken = null;
    this.memberToken = null;
  }

  getApiBaseUrl(environment) {
    const baseUrls = {
      dev: 'https://api.dev.skillflo.io/api/backoffice',
      qa: 'https://api.qa.skillflo.io/api/backoffice',
      staging: 'https://api.staging.skillflo.io/api/backoffice',
      production: 'https://api.skillflo.io/api/backoffice',
      local: 'http://localhost:3000/api/backoffice',
    };
    return baseUrls[environment.toLowerCase()] || baseUrls.staging;
  }

  async authenticate(email, password) {
    const url = `${this.apiBaseUrl}/auth`;
    const payload = {
      name: email,
      state: 'COMPLETED',
      extras: { password },
    };
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'x-bpo-member-token': '',
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) throw new Error('인증 실패');
    return response.json();
  }

  async getAccessToken(email, password) {
    const data = await this.authenticate(email, password);
    if (!data || !data.access_token || !data.expires_in) {
      throw new Error('Invalid access token response');
    }
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  async getMemberId(email, accessToken) {
    const url = `${this.apiBaseUrl}/member/login`;
    const params = new URLSearchParams({
      name: email,
      type: 'ADMIN',
      state: 'NORMAL',
      limit: '1',
    });
    
    const response = await fetch(`${url}?${params}`, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'authorization': `bearer ${accessToken}`,
        'x-bpo-member-token': '',
      },
    });
    
    if (!response.ok) throw new Error('회원 정보 조회 실패');
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        memberId: data[0].id,
        permissions: data[0].extras?.permissions || [],
      };
    }
    throw new Error('회원 정보를 찾을 수 없습니다');
  }

  async getMemberToken(memberId, accessToken) {
    const url = `${this.apiBaseUrl}/member/token`;
    const payload = { memberId };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'authorization': `bearer ${accessToken}`,
        'content-type': 'application/json',
        'x-bpo-member-token': '',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) throw new Error('Member token 조회 실패');
    const data = await response.json();
    
    if (!data || !data.access_token) {
      throw new Error('Invalid member token response');
    }
    return data.access_token;
  }

  async authenticateUser(email, password) {
    const { accessToken } = await this.getAccessToken(email, password);
    const { memberId } = await this.getMemberId(email, accessToken);
    const memberToken = await this.getMemberToken(memberId, accessToken);
    
    this.accessToken = accessToken;
    this.memberToken = memberToken;
    return { accessToken, memberToken };
  }
}

// MongoDB API 통신 클래스
class MongoDataFetcher {
  constructor(environment, email, password, authenticator) {
    this.authenticator = authenticator;
    this.email = email;
    this.password = password;
    this.baseUrl = this.getApiBaseUrl(environment);
    this.accessToken = null;
    this.memberToken = null;
  }

  getApiBaseUrl(environment) {
    const baseUrls = {
      dev: 'http://localhost:8084',
      qa: 'http://localhost:8084',
      staging: 'http://localhost:8084',
      production: 'http://localhost:8084',
      local: 'http://localhost:8084',
    };
    return baseUrls[environment.toLowerCase()] || baseUrls.local;
  }

  async authenticate() {
    const tokens = await this.authenticator.authenticateUser(this.email, this.password);
    this.accessToken = tokens.accessToken;
    this.memberToken = tokens.memberToken;
  }

  getHeaders() {
    if (!this.accessToken || !this.memberToken) {
      throw new Error('인증이 필요합니다');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'x-bpo-member-token': this.memberToken,
    };
  }

  async fetchClipProgressData(memberGroupId, productId, courseId, startAt, endAt) {
    const url = `${this.baseUrl}/api/backoffice/course-content/progress`;
    const params = new URLSearchParams({
      groupId: memberGroupId,
      productId: productId,
      courseId: courseId,
      startedAt: startAt,
      endedAt: endAt,
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('MongoDB 데이터 조회 실패:', error);
      throw error;
    }
  }
}

// 메타 데이터 조회 클래스
class MetaFetcher {
  constructor(environment, email, password, authenticator) {
    this.authenticator = authenticator;
    this.email = email;
    this.password = password;
    this.baseUrl = authenticator.apiBaseUrl;
    this.accessToken = null;
    this.memberToken = null;
  }

  async authenticate() {
    const tokens = await this.authenticator.authenticateUser(this.email, this.password);
    this.accessToken = tokens.accessToken;
    this.memberToken = tokens.memberToken;
  }

  getHeaders() {
    if (!this.accessToken || !this.memberToken) {
      throw new Error('인증이 필요합니다');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'x-bpo-member-token': this.memberToken,
    };
  }

  async fetchById(path, id) {
    try {
      const response = await fetch(`${this.baseUrl}${path}/${id}`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async fetchMembersBatch(memberIds) {
    if (!this.accessToken || !this.memberToken) {
      throw new Error('인증이 필요합니다');
    }

    const idsParam = memberIds.join(',');
    const url = `${this.baseUrl}/member/ids`;
    const params = new URLSearchParams({ ids: idsParam });

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) throw new Error('멤버 배치 조회 실패');
      const data = await response.json();

      const mapping = {};
      if (Array.isArray(data)) {
        data.forEach(memberData => {
          try {
            const memberId = parseInt(memberData.id);
            const extras = memberData.extras || {};
            mapping[memberId] = {
              id: memberId,
              name: memberData.name,
              displayName: extras.name,
            };
          } catch (e) {
            // 파싱 실패 시 무시
          }
        });
      }

      return mapping;
    } catch (error) {
      console.error(`멤버 배치 조회 실패: ${error.message}`);
      return {};
    }
  }

  async fetchMembersBulk(memberIds, batchSize = 50) {
    const mapping = {};
    
    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
      const batchMapping = await this.fetchMembersBatch(batch);
      Object.assign(mapping, batchMapping);
    }

    return mapping;
  }

  async fetchCoursesByIds(courseIds) {
    const mapping = {};
    for (const id of courseIds) {
      const data = await this.fetchById('/course', id);
      if (data) {
        mapping[id] = {
          id,
          name: data.publicName || data.name,
        };
      }
    }
    return mapping;
  }

  async fetchProductsByIds(productIds) {
    const mapping = {};
    for (const id of productIds) {
      const data = await this.fetchById('/product', id);
      if (data) {
        const extras = data.extras || {};
        mapping[id] = {
          id,
          name: extras.publicName || data.name,
        };
      }
    }
    return mapping;
  }

  async fetchContentsByIds(contentIds) {
    const mapping = {};
    for (const id of contentIds) {
      const data = await this.fetchById('/course-content', id);
      if (data) {
        mapping[id] = {
          id,
          name: data.name,
        };
      }
    }
    return mapping;
  }
}

// 유틸리티 함수들
function parseMonthFromDate(dateStr) {
  if (!dateStr) return null;
  try {
    const dt = new Date(dateStr);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

function toInt(value) {
  try {
    if (value === null || value === '') return 0;
    return parseInt(value, 10) || 0;
  } catch {
    return 0;
  }
}

function secondsToHms(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// MongoDB 데이터를 CSV 형태로 변환
function convertMongoDataToCSVFormat(mongoData) {
  return mongoData.map(item => ({
    targetId: item.targetId,
    productId: item.productId,
    courseId: item.courseId,
    courseContentId: item.courseContentId,
    dailyDate: item.dailyDate,
    cumulativePlayTime: item.cumulativePlayTime,
    totalPlayTime: item.totalPlayTime,
    totalContentPlayTime: item.totalContentPlayTime,
  }));
}

function extractRequiredIds(rows) {
  const memberIds = new Set();
  const productIds = new Set();
  const courseIds = new Set();
  const contentIds = new Set();
  
  rows.forEach(row => {
    const memberId = toInt(row.targetId);
    const productId = toInt(row.productId);
    const courseId = toInt(row.courseId);
    const contentId = toInt(row.courseContentId);
    
    if (memberId > 0) memberIds.add(memberId);
    if (productId > 0) productIds.add(productId);
    if (courseId > 0) courseIds.add(courseId);
    if (contentId > 0) contentIds.add(contentId);
  });
  
  return { memberIds, productIds, courseIds, contentIds };
}

function aggregateMonthly(rows) {
  const aggregates = {};
  
  rows.forEach(row => {
    const month = parseMonthFromDate(row.dailyDate);
    if (!month) return;
    
    const memberId = toInt(row.targetId);
    const productId = toInt(row.productId);
    const courseId = toInt(row.courseId);
    const contentId = toInt(row.courseContentId);
    const cumulative = toInt(row.cumulativePlayTime);
    const total = toInt(row.totalPlayTime);
    const contentTotal = toInt(row.totalContentPlayTime);
    
    const key = `${month}|${memberId}|${productId}|${courseId}|${contentId}`;
    
    if (!aggregates[key]) {
      aggregates[key] = {
        month,
        memberId,
        productId,
        courseId,
        contentId,
        cumulativePlayTime: 0,
        totalPlayTime: 0,
        totalContentPlayTime: 0,
        rows: 0,
      };
    }
    
    aggregates[key].cumulativePlayTime += cumulative;
    aggregates[key].totalPlayTime += total;
    if (contentTotal > aggregates[key].totalContentPlayTime) {
      aggregates[key].totalContentPlayTime = contentTotal;
    }
    aggregates[key].rows += 1;
  });
  
  return Object.values(aggregates);
}

function generateOutputCSV(aggregates, coursesMap, productsMap, membersMap, contentsMap) {
  const headers = [
    'month', 'memberId', 'memberEmail', 'memberName',
    'productId', 'productName', 'courseId', 'courseName',
    'courseContentId', 'contentName', 'cumulativePlayTimeHms',
    'totalPlayTimeHms', 'totalContentPlayTimeHms', 'progressPercent', 'rowCount'
  ];
  
  const sorted = aggregates.sort((a, b) => {
    if (a.memberId !== b.memberId) return a.memberId - b.memberId;
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    if (a.courseId !== b.courseId) return a.courseId - b.courseId;
    if (a.productId !== b.productId) return a.productId - b.productId;
    return a.contentId - b.contentId;
  });
  
  const csvRows = [headers.join(',')];
  
  sorted.forEach(item => {
    const member = membersMap[item.memberId];
    const product = productsMap[item.productId];
    const course = coursesMap[item.courseId];
    const content = contentsMap[item.contentId];
    
    const progressPercent = item.totalContentPlayTime > 0
      ? `${Math.min(100, (item.totalPlayTime / item.totalContentPlayTime) * 100).toFixed(2)}%`
      : '';
    
    const row = [
      item.month,
      item.memberId,
      member?.name || '',
      member?.displayName || '',
      item.productId,
      product?.name || '',
      item.courseId,
      course?.name || '',
      item.contentId,
      content?.name || '',
      secondsToHms(item.cumulativePlayTime),
      secondsToHms(item.totalPlayTime),
      secondsToHms(item.totalContentPlayTime),
      progressPercent,
      item.rows,
    ];
    
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

export default function CourseClipScriptRunner() {
  const [dataSource, setDataSource] = useState('csv'); // 'csv' or 'mongo'
  const [file, setFile] = useState(null);
  const [environment, setEnvironment] = useState('staging');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // MongoDB 연결 정보
  const [memberGroupId, setMemberGroupId] = useState('');
  const [productId, setProductId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  
  // 날짜 유효성 검사
  const isDateValid = startAt && endAt && new Date(startAt) <= new Date(endAt);

  const memberBatchSize = 50;
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState([]);
  const [resultFile, setResultFile] = useState(null);
  const [resultCSV, setResultCSV] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith('.csv')) {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('CSV 파일만 업로드 가능합니다.');
      setFile(null);
    }
  };

  const addProgress = (message) => {
    setProgress(prev => [...prev, { 
      time: new Date().toLocaleTimeString('ko-KR'), 
      message 
    }]);
  };

  const executeScript = async () => {
    setIsRunning(true);
    setProgress([]);
    setError(null);
    setResultFile(null);
    setResultCSV(null);

    try {
      let rows = [];
      
      if (dataSource === 'csv') {
        addProgress(`입력 파일: ${file.name}`);
        
        // CSV 파일 읽기
        const fileContent = await file.text();
        rows = parseCSV(fileContent);
        
        addProgress(`총 ${rows.length}개 행 읽음`);
      } else if (dataSource === 'mongo') {
        addProgress('MongoDB에서 데이터 조회 중...');
        
        // MongoDB API 인증
        const authenticator = new TokenAuthenticator(environment);
        const mongoFetcher = new MongoDataFetcher(environment, email, password, authenticator);
        await mongoFetcher.authenticate();
        addProgress('MongoDB 인증 완료');
        
        // MongoDB 데이터 조회
        const mongoData = await mongoFetcher.fetchClipProgressData(memberGroupId, productId, courseId, startAt, endAt);
        addProgress(`MongoDB에서 ${mongoData.length}개 데이터 조회 완료`);
        
        // MongoDB 데이터를 CSV 형태로 변환
        rows = convertMongoDataToCSVFormat(mongoData);
        addProgress(`CSV 형태로 변환 완료: ${rows.length}개 행`);
      }
      
      // 필요한 ID 추출
      addProgress('필요한 ID 추출 중...');
      const { memberIds, productIds, courseIds, contentIds } = extractRequiredIds(rows);
      addProgress(`필요한 ID 수 - 멤버: ${memberIds.size}, 상품: ${productIds.size}, 코스: ${courseIds.size}, 콘텐츠: ${contentIds.size}`);
      
      // 월별 집계
      addProgress('월별 집계 시작...');
      const aggregates = aggregateMonthly(rows);
      addProgress(`집계 키 수: ${aggregates.length}`);
      
      // API 인증 (메타 데이터 조회용)
      addProgress('메타 조회(인증)...');
      const authenticator = new TokenAuthenticator(environment);
      const fetcher = new MetaFetcher(environment, email, password, authenticator);
      await fetcher.authenticate();
      addProgress('인증 완료');
      
      // 코스 정보 조회
      addProgress(`필요한 코스 정보만 조회 중 (${courseIds.size}개)...`);
      const coursesMap = await fetcher.fetchCoursesByIds(Array.from(courseIds));
      addProgress(`조회된 코스 수: ${Object.keys(coursesMap).length} / 필요한 코스 수: ${courseIds.size}`);
      
      // 상품 정보 조회
      addProgress(`필요한 상품 정보만 조회 중 (${productIds.size}개)...`);
      const productsMap = await fetcher.fetchProductsByIds(Array.from(productIds));
      addProgress(`조회된 상품 수: ${Object.keys(productsMap).length} / 필요한 상품 수: ${productIds.size}`);
      
      // 멤버 정보 배치 조회
      addProgress(`필요한 멤버 정보만 배치 조회 중 (${memberIds.size}개)...`);
      const membersMap = await fetcher.fetchMembersBulk(Array.from(memberIds), memberBatchSize);
      addProgress(`조회된 멤버 수: ${Object.keys(membersMap).length} / 필요한 멤버 수: ${memberIds.size}`);
      
      // 콘텐츠 정보 조회
      addProgress(`필요한 콘텐츠 정보만 조회 중 (${contentIds.size}개)...`);
      const contentsMap = await fetcher.fetchContentsByIds(Array.from(contentIds));
      addProgress(`조회된 콘텐츠 수: ${Object.keys(contentsMap).length} / 필요한 콘텐츠 수: ${contentIds.size}`);
      
      // CSV 생성
      addProgress('CSV 내보내기...');
      const outputCSV = generateOutputCSV(aggregates, coursesMap, productsMap, membersMap, contentsMap);
      
      const resultFileName = `course_clip_progress_monthly_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.csv`;
      setResultFile(resultFileName);
      setResultCSV(outputCSV);
      addProgress(`완료! 결과 파일: ${resultFileName}`);

    } catch (err) {
      console.error(err);
      setError(err.message || '알 수 없는 오류가 발생했습니다.');
      addProgress(`오류 발생: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = () => {
    if (dataSource === 'csv') {
      if (!file) {
        setError('입력 CSV 파일을 선택해주세요.');
        return;
      }
    } else if (dataSource === 'mongo') {
      if (!memberGroupId || !productId || !courseId || !startAt || !endAt) {
        setError('MongoDB 연결에 필요한 모든 정보를 입력해주세요.');
        return;
      }
      
      // 날짜 유효성 검사
      if (new Date(startAt) > new Date(endAt)) {
        setError('종료일자는 시작일자보다 이후여야 합니다.');
        return;
      }
    }
    
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    executeScript();
  };

  const handleDownload = () => {
    if (!resultCSV) return;
    
    const blob = new Blob([resultCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = resultFile;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                클립 월별 수강 시간 집계 스크립트
              </h1>
              <p className="text-gray-600">
                CSV 파일에서 월별 수강 데이터를 집계하고 분석합니다
              </p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
          </div>

          <div className="space-y-6">
            {/* 데이터 소스 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                데이터 소스 선택
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="dataSource"
                    value="csv"
                    checked={dataSource === 'csv'}
                    onChange={(e) => setDataSource(e.target.value)}
                    disabled={isRunning}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">CSV 파일 업로드</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="dataSource"
                    value="mongo"
                    checked={dataSource === 'mongo'}
                    onChange={(e) => setDataSource(e.target.value)}
                    disabled={isRunning}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">MongoDB 연결</span>
                </label>
              </div>
            </div>

            {/* CSV 파일 업로드 */}
            {dataSource === 'csv' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  입력 CSV 파일
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                    disabled={isRunning}
                  />
                  <label
                    htmlFor="file-upload"
                    className={`flex items-center justify-center w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                      file
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-indigo-500 hover:bg-indigo-50'
                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Upload className="w-5 h-5 mr-2 text-gray-600" />
                    <span className="text-sm text-gray-600">
                      {file ? file.name : 'summary_progress_product_course_contents.csv 선택'}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* MongoDB 연결 정보 */}
            {dataSource === 'mongo' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-800">MongoDB 연결 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      멤버 그룹 ID
                    </label>
                    <input
                      type="text"
                      value={memberGroupId}
                      onChange={(e) => setMemberGroupId(e.target.value)}
                      disabled={isRunning}
                      placeholder="멤버 그룹 ID를 입력하세요"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      상품 ID
                    </label>
                    <input
                      type="text"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      disabled={isRunning}
                      placeholder="상품 ID를 입력하세요"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      코스 ID
                    </label>
                    <input
                      type="text"
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      disabled={isRunning}
                      placeholder="코스 ID를 입력하세요"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      시작 날짜
                    </label>
                    <input
                      type="date"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      disabled={isRunning}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      종료 날짜
                    </label>
                    <input
                      type="date"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      disabled={isRunning}
                      min={startAt || undefined}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 ${
                        startAt && endAt && !isDateValid 
                          ? 'border-red-300 bg-red-50' 
                          : 'border-gray-300'
                      }`}
                    />
                    {startAt && endAt && !isDateValid && (
                      <p className="mt-1 text-sm text-red-600">
                        종료일자는 시작일자보다 이후여야 합니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 환경 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                환경 선택
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                disabled={isRunning}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="dev">Development</option>
                <option value="qa">QA</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="local">Local</option>
              </select>
            </div>

            {/* 인증 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isRunning}
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isRunning}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* 실행 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={isRunning || (dataSource === 'csv' && !file) || (dataSource === 'mongo' && (!memberGroupId || !productId || !courseId || !startAt || !endAt || !isDateValid)) || !email || !password}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  실행 중...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  스크립트 실행
                </>
              )}
            </button>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* 진행 상황 */}
          {progress.length > 0 && (
            <div className="mt-6 bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                {isRunning ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin text-indigo-600" />
                ) : (
                  <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                )}
                실행 로그
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {progress.map((item, index) => (
                  <div key={index} className="flex items-start text-sm">
                    <span className="text-gray-500 mr-3 font-mono text-xs">[{item.time}]</span>
                    <span className="text-gray-700">{item.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 완료 및 다운로드 */}
          {resultFile && (
            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800">처리 완료!</p>
                    <p className="text-sm text-green-700 mt-1">결과 파일: {resultFile}</p>
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  다운로드
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 사용 안내 */}
        <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
          <h2 className="font-semibold text-gray-800 mb-3">사용 방법 <span className="text-red-600 font-semibold">(VPN 연결 필요)</span></h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">1.</span>
              <span>데이터 소스를 선택합니다 (CSV 파일 업로드 또는 MongoDB 연결)</span>
            </li>
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">2.</span>
              <span>CSV 선택 시: summary_progress_product_course_contents.csv 파일을 업로드합니다</span>
            </li>
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">3.</span>
              <span>MongoDB 선택 시: 멤버 그룹 ID, 상품 ID, 코스 ID, 시작/종료 날짜를 입력합니다 </span>
            </li>
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">4.</span>
              <span>환경을 선택합니다 (기본값: Staging)</span>
            </li>
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">5.</span>
              <span>Skillflo 인증 정보(이메일, 비밀번호)를 입력합니다</span>
            </li>
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">6.</span>
              <span>"스크립트 실행" 버튼을 클릭하여 집계를 시작합니다</span>
            </li>
            <li className="flex items-start">
              <span className="text-indigo-600 mr-2">7.</span>
              <span>완료 후 결과 CSV 파일을 다운로드합니다</span>
            </li>
          </ul>
          
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              <strong>주의:</strong> 실제 API 호출이 이루어지므로 네트워크 연결과 유효한 인증 정보가 필요합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

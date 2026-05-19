export default function PrivacyTermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">개인정보 수집 및 이용 동의 (필수)</h1>

        <div className="prose prose-sm prose-gray max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-gray-700 [&_p]:leading-relaxed [&_li]:text-gray-700 [&_table]:w-full [&_th]:bg-gray-50 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-sm [&_th]:font-medium [&_td]:px-4 [&_td]:py-2.5 [&_td]:text-sm [&_td]:border-t">

          <p><strong>마이랜드픽</strong>은 아래와 같이 개인정보를 수집 및 이용하며, 목적 외 개인정보를 이용하지 않습니다. 개인정보 수집 및 이용에 동의하지 않을 경우 서비스 가입 및 이용 제한이 있을 수 있습니다. 단, 선택항목에 대해서는 기입하지 않아도 서비스 가입 및 이용에 제한은 없습니다.</p>

          <h2>수집 및 이용 목적</h2>
          <ul>
            <li>파트너 가입 및 이용</li>
          </ul>

          <h2>수집 및 이용항목</h2>

          <table className="border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr>
                <th>구분</th>
                <th>수집 항목</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium align-top">1. 서비스 가입 및 이용</td>
                <td>성명(사업자명), 이메일주소, 비밀번호</td>
              </tr>
              <tr>
                <td className="font-medium align-top">2. 파트너 담당자 정보</td>
                <td>대표담당자: [필수] 이름, 전화번호, 이메일주소</td>
              </tr>
              <tr>
                <td className="font-medium align-top">3. 파트너 유형 및 증빙 제출</td>
                <td>
                  <p className="mb-1"><strong>사업자 파트너:</strong> 사업자등록번호, 사업자등록증, 체류증명서(해외상품 판매 시 필요), 통신판매업신고번호</p>
                  <p><strong>개인 파트너:</strong> 이름, 연락처, 이메일, 생년월일, 주소, 신분증 사본(생년월일, 성별)</p>
                </td>
              </tr>
              <tr>
                <td className="font-medium align-top">4. 대금 정산 시 수집되는 정보</td>
                <td>
                  <p><strong>사업자 파트너:</strong> [필수] 예금주명, 계좌번호, 사업자등록번호 / [선택] (해외계좌의 경우) SWIFT/BIN(은행고유코드), (미국송금 시) Routing 번호</p>
                </td>
              </tr>
            </tbody>
          </table>

          <h2>보유 및 이용기간</h2>
          <p>계약종료 및 회원탈퇴 시까지 (단, 관계법령에 의해 보존할 경우 그 의무기간 동안 별도 보관)</p>
          <p>파트너 회원가입 시 증빙서류 등록 후 파트너 심사 탈락 혹은 증빙 자료 미제출 시 90일 이후 파기</p>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-600"><strong>※ 동의를 거부할 권리 및 동의 거부에 따른 불이익</strong></p>
            <p className="text-sm text-gray-600 mt-1">개인정보 수집 및 이용에 대해 거부할 권리가 있으며, 동의를 거부할 경우 상품 예약 및 서비스 이용이 불가함을 알려 드립니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

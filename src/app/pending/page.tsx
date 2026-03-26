export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-2">승인 대기 중</h1>
        <p className="text-gray-600">
          가입 신청이 완료되었습니다.<br />
          관리자 승인 후 서비스를 이용하실 수 있습니다.
        </p>
      </div>
    </div>
  )
}

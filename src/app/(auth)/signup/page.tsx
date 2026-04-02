// src/app/(auth)/signup/page.tsx
import { Logo } from '@/components/Logo'
import { SignupWizard } from './SignupWizard'
import Link from 'next/link'

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <Logo />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <SignupWizard />
        <p className="mt-6 text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}

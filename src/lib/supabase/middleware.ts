import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()
  const isAuthPage = url.pathname === '/login' || url.pathname === '/signup'
  const isProtected = url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/agency') ||
    url.pathname.startsWith('/landco')

  if (!user && isProtected) {
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isProtected) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (profile?.status === 'pending') {
      url.pathname = '/pending'
      return NextResponse.redirect(url)
    }

    if (profile?.status === 'rejected') {
      url.pathname = '/login'
      const response = NextResponse.redirect(url)
      // 세션 쿠키 만료시켜 강제 로그아웃
      request.cookies.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) response.cookies.delete(name)
      })
      return response
    }
  }

  if (user && isAuthPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (!profile) return supabaseResponse

    if (profile.status === 'pending') {
      url.pathname = '/pending'
      return NextResponse.redirect(url)
    }
    if (profile.status === 'rejected') {
      // 정지된 계정: 세션 삭제 후 로그인 유지 안 함
      return supabaseResponse
    }
    const dest = profile.role === 'admin' ? '/admin'
      : profile.role === 'agency' ? '/agency' : '/landco'
    url.pathname = dest
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

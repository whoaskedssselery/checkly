import { useUserStore } from '@entities/user/model'
import { LoginPage } from '@pages/login/LoginPage'
import { useUiStore } from '@shared/lib/useUiStore'
import { lazy, Suspense, useEffect } from 'react'

// The board pulls in React Flow and the drag layer — the bulk of the bundle.
// Loading it on demand keeps the login screen (what everyone sees first) small.
const BoardPage = lazy(() =>
  import('@pages/board/BoardPage').then((m) => ({ default: m.BoardPage })),
)
const ProfilePage = lazy(() =>
  import('@pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)

export function App() {
  const screen = useUiStore((s) => s.screen)
  const setScreen = useUiStore((s) => s.setScreen)
  const user = useUserStore((s) => s.user)

  useEffect(() => {
    if (user) setScreen('board')
    // A dead session (logout, or a 401 from the API) always lands on login.
    else setScreen('login')
  }, [user, setScreen])

  return (
    <Suspense fallback={null}>
      {screen === 'board' ? <BoardPage /> : screen === 'profile' ? <ProfilePage /> : <LoginPage />}
    </Suspense>
  )
}

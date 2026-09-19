import { useUserStore } from '@entities/user/model'
import { BoardPage } from '@pages/board/BoardPage'
import { LoginPage } from '@pages/login/LoginPage'
import { ProfilePage } from '@pages/profile/ProfilePage'
import { useUiStore } from '@shared/lib/useUiStore'
import { useEffect } from 'react'

export function App() {
  const screen = useUiStore((s) => s.screen)
  const setScreen = useUiStore((s) => s.setScreen)
  const user = useUserStore((s) => s.user)

  useEffect(() => {
    if (user) setScreen('board')
  }, [user, setScreen])

  if (screen === 'board') return <BoardPage />
  if (screen === 'profile') return <ProfilePage />
  return <LoginPage />
}

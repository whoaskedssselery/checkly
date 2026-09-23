import { App } from '@app/App'
import { useUserStore } from '@entities/user/model'
import { hydrateBoard } from '@features/board-sync/boardSync'
import { startLiveSync } from '@features/board-sync/liveSync'
import { queryClient } from '@shared/api/queryClient'
import { setSessionStartHandler } from '@shared/api/session'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@app/styles/global.scss'

// Logging in loads the board first, so it never opens empty.
setSessionStartHandler(hydrateBoard)

startLiveSync()

// A restored session needs its board loaded before the first paint of it; a
// 401 here logs the user out through the unauthorized handler.
if (useUserStore.getState().user) void hydrateBoard().catch(() => {})

const root = document.getElementById('root')
if (!root) throw new Error('#root element is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

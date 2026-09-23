import { QueryClient } from '@tanstack/react-query'

// Reads are retried once on flaky networks; writes never are (a retried POST
// would create a duplicate card).
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } },
})

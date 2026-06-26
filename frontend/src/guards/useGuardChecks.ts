import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../queries'
import { useSession } from '../contexts/SessionContext'
import { api } from '../api'

export function useIsCurator(): boolean {
  const { isAuthenticated, isLoading: authLoading } = useSession()
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.admin.curatorCheck,
    queryFn: () => api.getCuratorCheck(),
    staleTime: Infinity,
    retry: false,
    enabled: isAuthenticated && !authLoading,
  })
  if (!isAuthenticated || authLoading || isLoading || isError) return false
  return !!data
}

export function useIsAdmin(): boolean {
  const { isAuthenticated, isLoading: authLoading } = useSession()
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.admin.stats,
    queryFn: () => api.getAdminStats(),
    staleTime: Infinity,
    retry: false,
    enabled: isAuthenticated && !authLoading,
  })
  if (!isAuthenticated || authLoading || isLoading || isError) return false
  return !!data
}

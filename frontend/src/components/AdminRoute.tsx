import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function AdminRoute() {
  const { user } = useAuth()
  return user?.platformRole === 'ADMIN' ? <Outlet /> : <Navigate to="/" replace />
}

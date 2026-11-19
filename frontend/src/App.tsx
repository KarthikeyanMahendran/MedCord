import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import CaseRoom from './pages/cases/CaseRoom'
import CasesHome from './pages/cases/CasesHome'
import Impact from './pages/cases/Impact'
import Radar from './pages/radar/Radar'
import NetworkPage from './pages/network/Network'
import FundHub from './pages/fund/FundHub'
import FundraiserDetail from './pages/fund/FundraiserDetail'
import NewFundraiser from './pages/fund/NewFundraiser'
import Library from './pages/cases/Library'
import NewCase from './pages/cases/NewCase'
import Verifications from './pages/admin/Verifications'
import Bookmarks from './pages/Bookmarks'
import ChannelChat from './pages/ChannelChat'
import CommunityDetail from './pages/CommunityDetail'
import Communities from './pages/Communities'
import Home from './pages/Home'
import Landing from './pages/landing/Landing'
import JoinInvite from './pages/JoinInvite'
import Login from './pages/Login'
import Register from './pages/Register'
import Search from './pages/Search'

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/communities" element={<Communities />} />
          <Route path="/communities/:id" element={<CommunityDetail />} />
          <Route path="/communities/:id/channels/:channelId" element={<ChannelChat />} />
          <Route path="/cases" element={<CasesHome />} />
          <Route path="/cases/new" element={<NewCase />} />
          <Route path="/cases/:id" element={<CaseRoom />} />
          <Route path="/library" element={<Library />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/radar" element={<Radar />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/fund" element={<FundHub />} />
          <Route path="/fund/new" element={<NewFundraiser />} />
          <Route path="/fund/:id" element={<FundraiserDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/messages" element={<ChannelChat />} />
          <Route path="/messages/:channelId" element={<ChannelChat />} />
          <Route path="/invite/:code" element={<JoinInvite />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin/verifications" element={<Verifications />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

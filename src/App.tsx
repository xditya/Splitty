import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { InstallSheet } from './components/InstallSheet'
import { useBill } from './store/bill'
import { HomeScreen } from './screens/Home'
import { PeopleScreen } from './screens/People'
import { ItemsScreen } from './screens/Items'
import { AssignScreen } from './screens/Assign'
import { ChargesScreen } from './screens/Charges'
import { SummaryScreen } from './screens/Summary'
import { SettingsScreen } from './screens/Settings'
import { JoinScreen } from './screens/Join'
import { SharedScreen } from './screens/Shared'

/** The bill flow is a step machine (§16 M2) — no route per step, no lost state. */
function BillFlow() {
  const step = useBill((s) => s.step)
  switch (step) {
    case 'people':
      return <PeopleScreen />
    case 'items':
      return <ItemsScreen />
    case 'assign':
      return <AssignScreen />
    case 'charges':
      return <ChargesScreen />
    case 'summary':
      return <SummaryScreen />
    default:
      return <HomeScreen />
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BillFlow />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/s" element={<SharedScreen />} />
        <Route path="/s/:code" element={<SharedScreen />} />
      </Routes>
      <Toaster position="top-center" />
      <InstallSheet />
    </BrowserRouter>
  )
}
